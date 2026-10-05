import { createHash, randomBytes } from 'node:crypto'
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
import { escapeLike, pageOf } from '../../common/pagination'
import type { AppRequest, AuthUser, PlantRow } from '../../common/types'
import { DB, type Database } from '../../database/database.module'
import { uuidv7 } from '../../database/schema/common'
import {
  assetDocuments,
  assets,
  documents,
  documentVersions,
  plantSettings,
  plantStages,
  stageDocuments,
  stageMaster,
  users,
} from '../../database/schema'
import { AuditService } from '../audit/audit.service'
import { AuthzService } from '../iam/authz.service'
import { PlantsService } from '../plants/plants.service'
import type { CreateDocumentDto, ListDocumentsQuery, UpdateDocumentDto } from './documents.schemas'
import { inspectUpload, type UploadInfo } from './file-validation'
import { StorageService } from './storage.service'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]
type Row = Awaited<ReturnType<DocumentsService['selectRows']>>[number]
type AssetRef = { id: string; tag: string; name: string }
type StageRef = { code: string; name: string }

const fullName = (first: string | null, last: string | null) => [first, last].filter(Boolean).join(' ') || null

@Injectable()
export class DocumentsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly authz: AuthzService,
    private readonly plants: PlantsService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  // ---------- Lectura ----------

  /** document.read ve todo; el resto solo lo PUBLIC, y únicamente si la planta publica sus documentos. */
  private async scope(plant: PlantRow, user: AuthUser | undefined) {
    const access = await this.authz.access(user, plant.id)
    const internal = access.permissions.has('document.read')
    const [settings] = await this.db.select().from(plantSettings).where(eq(plantSettings.plantId, plant.id)).limit(1)
    return { internal, publicDocs: !!settings?.publicDocuments, publicAssets: !!settings?.publicAssets }
  }

  /** Documento + su versión vigente + autor. */
  private selectRows() {
    return this.db
      .select({
        id: documents.id,
        plantId: documents.plantId,
        title: documents.title,
        documentType: documents.documentType,
        visibility: documents.visibility,
        status: documents.status,
        currentVersion: documents.currentVersion,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
        fileName: documentVersions.originalName,
        mimeType: documentVersions.mimeType,
        sizeBytes: documentVersions.sizeBytes,
        createdByFirst: users.firstName,
        createdByLast: users.lastName,
      })
      .from(documents)
      .innerJoin(documentVersions, and(eq(documentVersions.documentId, documents.id), eq(documentVersions.version, documents.currentVersion)))
      .leftJoin(users, eq(users.id, documents.createdBy))
  }

  private async linksOf(docIds: string[], publicOnly: { publicAssets: boolean } | null) {
    const assetMap = new Map<string, AssetRef[]>()
    const stageMap = new Map<string, StageRef[]>()
    if (docIds.length === 0) return { assetMap, stageMap }

    const assetRows = await this.db
      .select({ docId: assetDocuments.documentId, id: assets.id, tag: assets.tag, name: assets.name, isPublic: assets.isPublic })
      .from(assetDocuments)
      .innerJoin(assets, eq(assets.id, assetDocuments.assetId))
      .where(inArray(assetDocuments.documentId, docIds))
      .orderBy(asc(assets.tag))
    for (const a of assetRows) {
      // A los visitantes no se les revela la existencia de activos que no son públicos.
      if (publicOnly && !(publicOnly.publicAssets && a.isPublic)) continue
      assetMap.set(a.docId, [...(assetMap.get(a.docId) ?? []), { id: a.id, tag: a.tag, name: a.name }])
    }

    const stageRows = await this.db
      .select({ docId: stageDocuments.documentId, code: stageMaster.code, name: stageMaster.name, override: plantStages.nameOverride })
      .from(stageDocuments)
      .innerJoin(plantStages, eq(plantStages.id, stageDocuments.plantStageId))
      .innerJoin(stageMaster, eq(stageMaster.id, plantStages.stageMasterId))
      .where(inArray(stageDocuments.documentId, docIds))
      .orderBy(asc(stageMaster.code))
    for (const s of stageRows) stageMap.set(s.docId, [...(stageMap.get(s.docId) ?? []), { code: s.code, name: s.override ?? s.name }])
    return { assetMap, stageMap }
  }

  private toItem(r: Row, assetList: AssetRef[], stageList: StageRef[]) {
    return {
      id: r.id,
      title: r.title,
      documentType: r.documentType,
      visibility: r.visibility,
      status: r.status,
      currentVersion: r.currentVersion,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      file: { originalName: r.fileName, mimeType: r.mimeType, sizeBytes: r.sizeBytes },
      assets: assetList,
      stages: stageList,
    }
  }

  async list(ref: string, q: ListDocumentsQuery, user: AuthUser | undefined) {
    const plant = await this.plants.getVisible(ref, user)
    return this.listForPlant(plant, q, user)
  }

  /** Reutilizado por la ficha FUR del activo (pestaña Documentos). */
  async listForPlant(plant: PlantRow, q: ListDocumentsQuery, user: AuthUser | undefined) {
    const { internal, publicDocs, publicAssets } = await this.scope(plant, user)
    if (!internal && !publicDocs) return pageOf([], 0, q.page, q.pageSize)

    const conditions: Array<SQL | undefined> = [
      eq(documents.plantId, plant.id),
      internal ? eq(documents.status, q.status) : and(eq(documents.status, 'ACTIVE'), eq(documents.visibility, 'PUBLIC')),
      q.type ? eq(documents.documentType, q.type) : undefined,
      q.assetId
        ? sql`exists (select 1 from ${assetDocuments} ad where ad.document_id = ${documents.id} and ad.asset_id = ${q.assetId})`
        : undefined,
      q.stage
        ? sql`exists (select 1 from ${stageDocuments} sd
            inner join ${plantStages} ps on ps.id = sd.plant_stage_id
            inner join ${stageMaster} sm on sm.id = ps.stage_master_id
            where sd.document_id = ${documents.id} and sm.code = ${q.stage})`
        : undefined,
    ]
    if (q.search) {
      const like = `%${escapeLike(q.search)}%`
      conditions.push(or(ilike(documents.title, like), ilike(documentVersions.originalName, like)))
    }
    const where = and(...conditions)
    const dir = q.dir ?? (q.sort === 'title' ? 'asc' : 'desc')
    const order = q.sort === 'title' ? documents.title : documents.updatedAt

    const [rows, [{ total }]] = await Promise.all([
      this.selectRows()
        .where(where)
        .orderBy(dir === 'asc' ? asc(order) : desc(order), asc(documents.id))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(documents)
        .innerJoin(documentVersions, and(eq(documentVersions.documentId, documents.id), eq(documentVersions.version, documents.currentVersion)))
        .where(where),
    ])

    const { assetMap, stageMap } = await this.linksOf(rows.map((r) => r.id), internal ? null : { publicAssets })
    return pageOf(
      rows.map((r) => this.toItem(r, assetMap.get(r.id) ?? [], stageMap.get(r.id) ?? [])),
      total,
      q.page,
      q.pageSize,
    )
  }

  /** Un documento al que no tienes acceso es indistinguible de uno inexistente. */
  private async findAccessible(ref: string, documentId: string, user: AuthUser | undefined) {
    const plant = await this.plants.getVisible(ref, user)
    const scope = await this.scope(plant, user)
    const [row] = await this.selectRows().where(and(eq(documents.id, documentId), eq(documents.plantId, plant.id))).limit(1)
    const visible =
      !!row && (scope.internal || (scope.publicDocs && row.visibility === 'PUBLIC' && row.status === 'ACTIVE'))
    if (!visible) throw new NotFoundException('Documento no encontrado')
    return { plant, scope, row }
  }

  async get(ref: string, documentId: string, user: AuthUser | undefined) {
    const { scope, row } = await this.findAccessible(ref, documentId, user)
    return this.detail(row, scope)
  }

  private async detail(row: Row, scope: { internal: boolean; publicAssets: boolean }) {
    const { assetMap, stageMap } = await this.linksOf([row.id], scope.internal ? null : { publicAssets: scope.publicAssets })
    const versions = await this.db
      .select({
        version: documentVersions.version,
        originalName: documentVersions.originalName,
        mimeType: documentVersions.mimeType,
        sizeBytes: documentVersions.sizeBytes,
        checksum: documentVersions.checksum,
        note: documentVersions.note,
        createdAt: documentVersions.createdAt,
        first: users.firstName,
        last: users.lastName,
      })
      .from(documentVersions)
      .leftJoin(users, eq(users.id, documentVersions.uploadedBy))
      .where(
        scope.internal
          ? eq(documentVersions.documentId, row.id)
          : and(eq(documentVersions.documentId, row.id), eq(documentVersions.version, row.currentVersion)),
      )
      .orderBy(desc(documentVersions.version))

    return {
      ...this.toItem(row, assetMap.get(row.id) ?? [], stageMap.get(row.id) ?? []),
      // Autor, notas y checksums son información interna de la planta.
      ...(scope.internal && { createdBy: fullName(row.createdByFirst, row.createdByLast) }),
      versions: versions.map((v) => ({
        version: v.version,
        originalName: v.originalName,
        mimeType: v.mimeType,
        sizeBytes: v.sizeBytes,
        createdAt: v.createdAt,
        isCurrent: v.version === row.currentVersion,
        ...(scope.internal && { checksum: v.checksum, note: v.note, uploadedBy: fullName(v.first, v.last) }),
      })),
    }
  }

  /** Entrega el archivo. El personal interno puede pedir cualquier versión; los visitantes solo la vigente. */
  async download(ref: string, documentId: string, user: AuthUser | undefined, opts: { version?: number; inline: boolean }, req: AppRequest) {
    const { plant, scope, row } = await this.findAccessible(ref, documentId, user)
    const version = opts.version ?? row.currentVersion
    if (!scope.internal && version !== row.currentVersion) throw new NotFoundException('Documento no encontrado')

    const [v] = await this.db
      .select()
      .from(documentVersions)
      .where(and(eq(documentVersions.documentId, documentId), eq(documentVersions.version, version)))
      .limit(1)
    if (!v) throw new NotFoundException('Versión no encontrada')

    let stream
    try {
      stream = await this.storage.open(v.storageKey)
    } catch {
      throw new NotFoundException('El archivo no está disponible en el almacenamiento')
    }

    // Trazabilidad de quién accede a documentación interna.
    if (row.visibility === 'INTERNAL') {
      await this.audit.record(req, {
        module: 'documents',
        entityType: 'document',
        entityId: documentId,
        plantId: plant.id,
        action: 'downloaded',
        newData: { version, inline: opts.inline },
      })
    }
    return { stream, originalName: v.originalName, mimeType: v.mimeType, sizeBytes: v.sizeBytes }
  }

  // ---------- Escritura ----------

  private async resolveAssets(plantId: string, ids: string[]): Promise<string[]> {
    const unique = [...new Set(ids)]
    if (unique.length === 0) return []
    const rows = await this.db.select({ id: assets.id }).from(assets).where(and(eq(assets.plantId, plantId), inArray(assets.id, unique)))
    if (rows.length !== unique.length) throw new BadRequestException('Alguno de los activos no existe en esta planta')
    return unique
  }

  /** §47: solo etapas habilitadas de la misma planta. */
  private async resolveStages(plantId: string, codes: string[]): Promise<string[]> {
    const unique = [...new Set(codes)]
    if (unique.length === 0) return []
    const rows = await this.db
      .select({ id: plantStages.id, code: stageMaster.code })
      .from(plantStages)
      .innerJoin(stageMaster, eq(stageMaster.id, plantStages.stageMasterId))
      .where(and(eq(plantStages.plantId, plantId), eq(plantStages.isEnabled, true), inArray(stageMaster.code, unique)))
    const missing = unique.filter((c) => !rows.some((r) => r.code === c))
    if (missing.length > 0) throw new BadRequestException(`Etapas no habilitadas en esta planta: ${missing.join(', ')}`)
    return rows.map((r) => r.id)
  }

  private async setLinks(tx: Tx, documentId: string, assetIds: string[] | undefined, stageIds: string[] | undefined) {
    if (assetIds) {
      await tx.delete(assetDocuments).where(eq(assetDocuments.documentId, documentId))
      if (assetIds.length > 0) await tx.insert(assetDocuments).values(assetIds.map((assetId) => ({ documentId, assetId })))
    }
    if (stageIds) {
      await tx.delete(stageDocuments).where(eq(stageDocuments.documentId, documentId))
      if (stageIds.length > 0) await tx.insert(stageDocuments).values(stageIds.map((plantStageId) => ({ documentId, plantStageId })))
    }
  }

  private newKey(plantId: string, documentId: string, version: number, info: UploadInfo) {
    return `${plantId}/${documentId}/v${version}-${randomBytes(8).toString('hex')}.${info.extension}`
  }

  async create(plant: PlantRow, dto: CreateDocumentDto, file: Express.Multer.File, req: AppRequest) {
    const info = inspectUpload(file.originalname, file.buffer)
    const assetIds = await this.resolveAssets(plant.id, dto.assetIds)
    const stageIds = await this.resolveStages(plant.id, dto.stageCodes)

    const documentId = uuidv7()
    const key = this.newKey(plant.id, documentId, 1, info)
    await this.storage.put(key, file.buffer)

    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(documents).values({
          id: documentId,
          plantId: plant.id,
          title: dto.title,
          documentType: dto.documentType,
          visibility: dto.visibility,
          currentVersion: 1,
          createdBy: req.user?.id,
        })
        await tx.insert(documentVersions).values({
          documentId,
          version: 1,
          originalName: info.originalName,
          mimeType: info.mimeType,
          sizeBytes: file.buffer.length,
          checksum: createHash('sha256').update(file.buffer).digest('hex'),
          storageKey: key,
          note: dto.note ?? null,
          uploadedBy: req.user?.id,
        })
        await this.setLinks(tx, documentId, assetIds, stageIds)
      })
    } catch (err) {
      await this.storage.delete(key).catch(() => undefined) // no dejar huérfano el archivo si falló la base
      throw err
    }

    await this.audit.record(req, {
      module: 'documents',
      entityType: 'document',
      entityId: documentId,
      plantId: plant.id,
      action: 'created',
      newData: { title: dto.title, documentType: dto.documentType, visibility: dto.visibility, fileName: info.originalName, sizeBytes: file.buffer.length },
    })
    return this.get(plant.id, documentId, req.user)
  }

  async addVersion(plant: PlantRow, documentId: string, file: Express.Multer.File, note: string | undefined, req: AppRequest) {
    const [doc] = await this.db.select().from(documents).where(and(eq(documents.id, documentId), eq(documents.plantId, plant.id))).limit(1)
    if (!doc) throw new NotFoundException('Documento no encontrado')
    if (doc.status === 'ARCHIVED') throw new ConflictException('El documento está archivado y no admite nuevas versiones')

    const info = inspectUpload(file.originalname, file.buffer)
    let key = ''
    let version = 0
    try {
      await this.db.transaction(async (tx) => {
        // El incremento atómico garantiza números de versión distintos aunque se suban dos a la vez.
        const [{ next }] = await tx
          .update(documents)
          .set({ currentVersion: sql`${documents.currentVersion} + 1`, updatedAt: new Date() })
          .where(eq(documents.id, documentId))
          .returning({ next: documents.currentVersion })
        version = next
        key = this.newKey(plant.id, documentId, version, info)
        await this.storage.put(key, file.buffer)
        await tx.insert(documentVersions).values({
          documentId,
          version,
          originalName: info.originalName,
          mimeType: info.mimeType,
          sizeBytes: file.buffer.length,
          checksum: createHash('sha256').update(file.buffer).digest('hex'),
          storageKey: key,
          note: note ?? null,
          uploadedBy: req.user?.id,
        })
      })
    } catch (err) {
      if (key) await this.storage.delete(key).catch(() => undefined)
      throw err
    }

    await this.audit.record(req, {
      module: 'documents',
      entityType: 'document',
      entityId: documentId,
      plantId: plant.id,
      action: 'version.created',
      oldData: { version: version - 1 },
      newData: { version, fileName: info.originalName, sizeBytes: file.buffer.length, note: note ?? null },
    })
    return this.get(plant.id, documentId, req.user)
  }

  async update(plant: PlantRow, documentId: string, dto: UpdateDocumentDto, req: AppRequest) {
    const [before] = await this.db.select().from(documents).where(and(eq(documents.id, documentId), eq(documents.plantId, plant.id))).limit(1)
    if (!before) throw new NotFoundException('Documento no encontrado')
    if (before.status === 'ARCHIVED') throw new ConflictException('El documento está archivado y no se puede modificar')

    const assetIds = dto.assetIds ? await this.resolveAssets(plant.id, dto.assetIds) : undefined
    const stageIds = dto.stageCodes ? await this.resolveStages(plant.id, dto.stageCodes) : undefined

    await this.db.transaction(async (tx) => {
      await tx
        .update(documents)
        .set({
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.documentType !== undefined && { documentType: dto.documentType }),
          ...(dto.visibility !== undefined && { visibility: dto.visibility }),
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId))
      await this.setLinks(tx, documentId, assetIds, stageIds)
    })

    await this.audit.record(req, {
      module: 'documents',
      entityType: 'document',
      entityId: documentId,
      plantId: plant.id,
      action: 'updated',
      oldData: { title: before.title, documentType: before.documentType, visibility: before.visibility },
      newData: dto,
    })
    return this.get(plant.id, documentId, req.user)
  }

  /** Archivar oculta el documento pero conserva archivos, versiones y auditoría (§47.10). */
  async archive(plant: PlantRow, documentId: string, req: AppRequest) {
    const [doc] = await this.db.select().from(documents).where(and(eq(documents.id, documentId), eq(documents.plantId, plant.id))).limit(1)
    if (!doc) throw new NotFoundException('Documento no encontrado')
    if (doc.status === 'ARCHIVED') return

    await this.db.update(documents).set({ status: 'ARCHIVED', updatedAt: new Date() }).where(eq(documents.id, documentId))
    await this.audit.record(req, {
      module: 'documents',
      entityType: 'document',
      entityId: documentId,
      plantId: plant.id,
      action: 'archived',
      oldData: { status: 'ACTIVE' },
      newData: { status: 'ARCHIVED' },
    })
  }
}
