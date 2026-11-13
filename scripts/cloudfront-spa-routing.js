// CloudFront Function: associate only with the default S3 frontend behavior.
// Keep /api/* on its own uncached behavior, without global HTML error pages.
function handler(event) {
  var request = event.request;
  var last = request.uri.split('/').pop();
  if (request.uri.indexOf('/api/') !== 0 && last.indexOf('.') === -1) {
    request.uri = '/index.html';
  }
  return request;
}
