# Servidor estático mínimo para abrir _demo/preview.html en un navegador real.
# Solo sirve para desarrollo: no se sube a Apps Script.
#   powershell -NoProfile -ExecutionPolicy Bypass -File _demo\servidor.ps1
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$puerto = 8765

$oyente = New-Object System.Net.HttpListener
$oyente.Prefixes.Add("http://localhost:$puerto/")
$oyente.Start()
Write-Host "Demo en http://localhost:$puerto/preview.html"

$tipos = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.svg'  = 'image/svg+xml'
}

while ($oyente.IsListening) {
  $ctx = $oyente.GetContext()
  $ruta = $ctx.Request.Url.LocalPath.TrimStart('/')
  if ([string]::IsNullOrWhiteSpace($ruta)) { $ruta = 'preview.html' }
  $archivo = Join-Path $raiz $ruta

  if (Test-Path $archivo -PathType Leaf) {
    $bytes = [IO.File]::ReadAllBytes($archivo)
    $ext = [IO.Path]::GetExtension($archivo).ToLower()
    $ctx.Response.ContentType = if ($tipos.ContainsKey($ext)) { $tipos[$ext] } else { 'application/octet-stream' }
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $ctx.Response.StatusCode = 404
  }
  $ctx.Response.OutputStream.Close()
}
