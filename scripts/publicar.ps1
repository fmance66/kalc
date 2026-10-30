# Publica Kalc en un servidor Windows con IIS desde la PC de desarrollo, sin entrar al servidor:
# kalc-backend y kalc-frontend, cada uno con su npm run publicar, y al final compara lo que quedó
# publicado con el repositorio.
#
#   .\scripts\publicar.ps1 -Servidor <servidor>              los dos (primero kalc-backend)
#   .\scripts\publicar.ps1 -Servidor <servidor> -Solo backend   o -Solo frontend
#   .\scripts\publicar.ps1 -Servidor <servidor> -Prueba      compila y muestra qué copiaría, sin copiar nada
#   .\scripts\publicar.ps1 -Servidor <servidor> -Forzar      publica aunque no haya cambios
#   .\scripts\publicar.ps1 -Servidor <servidor> -Verificar   solo compara lo publicado con el repositorio
#
# El servidor también puede venir en la variable de entorno KALC_SERVIDOR. Se publica en
# \\<servidor>\c\app\kalc-backend y \\<servidor>\c\inetpub\wwwroot\kalc, y la app queda en
# http://<servidor>/kalc/.
#
# Antes de publicar se fija en el remoto (git fetch): si la copia local está atrasada, ofrece hacer
# git pull; si no, no publica (publicaría una versión vieja). Una parte sin cambios desde el commit
# publicado se saltea: así correrlo siempre no reinicia la API sin necesidad.
#
# Si no hay conexión a la carpeta compartida (\\<servidor>\c), la hace (net use) y pide la
# contraseña. kalc-backend se reinicia solo: su npm run publicar crea la marca "publicando", la API
# se cierra, copia, la borra y espera a que vuelva (ver su README, "Despliegue"). La primera vez hay
# pasos en el servidor: el script avisa.
#
# Desde PowerShell (Windows PowerShell 5.1 alcanza), no desde Git Bash: convierte \\ en \.

param(
    [string]$Servidor = $env:KALC_SERVIDOR,
    [ValidateSet('backend', 'frontend')]
    [string]$Solo,
    [switch]$Prueba,
    [switch]$Forzar,
    [switch]$Verificar,
    # la cuenta local del servidor para el net use
    [string]$Usuario
)

$ErrorActionPreference = 'Stop'
if (-not $Servidor) { throw 'Falta el servidor: -Servidor <servidor> o la variable de entorno KALC_SERVIDOR.' }
$Raiz = Split-Path -Parent $PSScriptRoot
$Compartida = "\\$Servidor\c"
$Url = "http://$Servidor/kalc/"

# Lo que usan los npm run publicar de cada parte (ver sus README).
$env:KALC_BACKEND_DESTINO = "$Compartida\app\kalc-backend"
$env:KALC_BACKEND_URL = "${Url}api/version"
$env:KALC_DESTINO = "$Compartida\inetpub\wwwroot\kalc"
$env:KALC_URL = $Url

function Titulo($texto) { Write-Host "`n=== $texto" -ForegroundColor Cyan }
function Aviso($texto) { Write-Host $texto -ForegroundColor Yellow }

# Sin proxy: un proxy de la red puede no llegar al servidor (o responder otra cosa).
function Leer($direccion) {
    $cliente = New-Object System.Net.WebClient
    $cliente.Proxy = $null
    $cliente.Encoding = [System.Text.Encoding]::UTF8
    try { $cliente.DownloadString($direccion) } catch { $null }
}

function Commit {
    $commit = (git -C $Raiz rev-parse --short=8 HEAD)
    if (git -C $Raiz status --porcelain) { $commit += '+cambios' }
    $commit
}

# Si la parte está igual que en el commit publicado: el commit existe, y ni los commits de después
# ni lo que no está commiteado tocan su carpeta.
function AlDia($parte, $publicado) {
    if (-not $publicado -or $publicado.EndsWith('+cambios')) { return $false }
    git -C $Raiz cat-file -e "$publicado^{commit}" 2>$null
    if ($LASTEXITCODE -ne 0) { return $false }
    git -C $Raiz diff --quiet $publicado -- $parte
    $LASTEXITCODE -eq 0
}

# Lo que está publicado de cada parte: commit y texto para mostrar (commit $null si no responde).
function Publicado {
    $app = @{ commit = $null; texto = '(no responde)' }
    $indice = Leer $Url
    if ($indice -and $indice -match 'assets/index-[\w-]+\.js') {
        $js = Leer "$Url$($Matches[0])"
        if ($js -match 'VITE_VERSION:`([^`]*)`,VITE_VERSION_COMMIT:`([^`]*)`,VITE_VERSION_FECHA:`([^`]*)`') {
            $app = @{ commit = $Matches[2]; texto = "v$($Matches[1]) · $($Matches[2]) del $($Matches[3])" }
        }
    }
    $api = @{ commit = $null; texto = '(sin /api/version: no responde, o es anterior a esa ruta)' }
    $respuesta = Leer "${Url}api/version"
    if ($respuesta) {
        $v = $respuesta | ConvertFrom-Json
        $api = @{ commit = $v.commit; texto = "v$($v.version) · $($v.commit) del $($v.fecha) (Kalc $($v.kalc))" }
    }
    @{ 'kalc-frontend' = $app; 'kalc-backend' = $api }
}

# Lo publicado contra el repositorio.
function Verificar {
    Titulo 'Qué está publicado'
    $publicado = Publicado
    $todas = $true
    $filas = foreach ($parte in @('kalc-frontend', 'kalc-backend')) {
        $alDia = AlDia $parte $publicado[$parte].commit
        if (-not $alDia) { $todas = $false }
        [pscustomobject]@{ Parte = $parte; Publicado = $publicado[$parte].texto; 'Al día' = $(if ($alDia) { 'sí' } else { 'no' }) }
    }
    $filas | Format-Table -AutoSize | Out-String | Write-Host
    Write-Host "Repositorio: $(Commit)"
    if ($todas) { Write-Host "Las dos partes están al día. $Url" -ForegroundColor Green }
    else { Aviso "Hay diferencias: lo publicado no es lo último del repositorio. ($Url)" }
}

if ($Verificar) { Verificar; return }

$partes = @('kalc-backend', 'kalc-frontend') | Where-Object { -not $Solo -or $_ -eq "kalc-$Solo" }

# 1. Contra el remoto: atrasado, publicaría una versión vieja; con cambios sin commitear o sin
# pushear, lo publicado no se puede reconstruir desde el remoto.
Titulo 'Repositorio'
git -C $Raiz fetch --quiet
if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar el remoto (git fetch).' }
$atrasado = [int](git -C $Raiz rev-list --count 'HEAD..@{u}')
if ($atrasado -gt 0) {
    Aviso "El repositorio está $atrasado commits atrás del remoto: publicaría una versión vieja."
    if ((Read-Host '  ¿Hacer git pull? (s/n)') -ne 's') { Aviso 'No se publicó nada.'; return }
    git -C $Raiz pull --ff-only
    if ($LASTEXITCODE -ne 0) { throw 'git pull falló (¿cambios locales que chocan?): resolverlo y repetir.' }
}
$sinCommitear = @(git -C $Raiz status --porcelain).Count
$sinPushear = [int](git -C $Raiz rev-list --count '@{u}..HEAD')
Write-Host "kalc $(Commit)"
if ($sinCommitear -or $sinPushear) {
    Aviso "  $sinCommitear archivos sin commitear, $sinPushear commits sin pushear: se publica igual, con '+cambios' en la versión si hay sin commitear."
    if (-not $Prueba -and (Read-Host '  ¿Seguir? (s/n)') -ne 's') { return }
}

# 2. Una parte sin cambios desde lo publicado no se vuelve a publicar (salvo -Forzar).
if (-not $Forzar) {
    $publicado = Publicado
    $pendientes = @($partes | Where-Object {
        if (AlDia $_ $publicado[$_].commit) { Write-Host "$_ no cambió desde $($publicado[$_].commit): se saltea (-Forzar para publicarlo igual)."; $false } else { $true }
    })
    if (-not $pendientes) { Verificar; return }
    $partes = $pendientes
}

# 3. La carpeta compartida: robocopy no pide credenciales.
Titulo "Carpeta compartida $Compartida"
if (Test-Path "$Compartida\inetpub") {
    Write-Host 'Conectada.'
} else {
    if (-not $Usuario) { $Usuario = Read-Host "Usuario local del servidor ($Servidor\<usuario>)" }
    net use $Compartida "/user:$Servidor\$Usuario" *
    if ($LASTEXITCODE -ne 0) { throw "No se pudo conectar (si dice error 1219: net use $Compartida /delete, y repetir)." }
}

# 4. La primera vez kalc-backend necesita pasos en el servidor.
if ($partes -contains 'kalc-backend' -and -not (Test-Path "$Compartida\app\kalc-backend\.env")) {
    Aviso @"
En el servidor no está C:\app\kalc-backend\.env: es la primera vez. Después de esta publicación,
en el servidor, en PowerShell como administrador (ver "Primera vez" en el README de kalc-backend):
  1. crear C:\app\kalc-backend\.env (como .env.example, con PUERTO=8082)
  2. cd C:\app\kalc-backend; .\scripts\servicio.ps1 -Accion instalar
  3. después de publicar kalc-frontend: .\scripts\servicio.ps1 -Accion iis
"@
    if (-not $Prueba -and (Read-Host '¿Publicar igual? (s/n)') -ne 's') { return }
}

# 5. Cada una con su npm run publicar.
foreach ($parte in $partes) {
    Titulo "Publicando $parte"
    Push-Location (Join-Path $Raiz $parte)
    try {
        if ($Prueba) { npm run publicar:prueba } else { npm run publicar }
        if ($LASTEXITCODE -ne 0) { throw "Falló npm run publicar en $parte." }
    } finally {
        Pop-Location
    }
}

if (-not $Prueba) { Verificar }
