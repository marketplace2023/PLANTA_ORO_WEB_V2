import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ThrottlerGuard } from '@nestjs/throttler'
import type { CookieOptions, Response } from 'express'
import type { Env } from '../../config/env'
import type { AppRequest, AuthUser } from '../../common/types'
import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { type LoginDto, loginSchema, type RegisterDto, registerSchema } from './auth.schemas'
import { AuthService, type Session } from './auth.service'
import { CurrentUser, Public } from './decorators'

const REFRESH_COOKIE = 'fur_rt'

/** Límite por IP (AUTH_RATE_LIMIT_PER_MINUTE) para frenar fuerza bruta. Arquitectura §40. */
@UseGuards(ThrottlerGuard)
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Post('register')
  async register(
    @Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, await this.auth.register(dto, req))
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, await this.auth.login(dto, req))
  }

  /** Usa la cookie httpOnly: el JavaScript del navegador nunca ve el refresh token. */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined
    if (!token) throw new UnauthorizedException('Sin sesión')
    try {
      return this.respond(res, await this.auth.refresh(token, req))
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, this.cookieOptions())
      throw err
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE] as string | undefined)
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions())
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user)
  }

  private respond(res: Response, session: Session) {
    const { refreshToken, ...body } = session
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...this.cookieOptions(),
      maxAge: this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }) * 86_400_000,
    })
    return body
  }

  private cookieOptions(): CookieOptions {
    const sameSite = this.config.get('COOKIE_SAMESITE', { infer: true })
    return {
      httpOnly: true,
      // SameSite=None exige Secure; en producción siempre va por HTTPS.
      secure: sameSite === 'none' || this.config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite,
      path: '/api/v1/auth',
    }
  }
}
