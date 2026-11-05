$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$source = Join-Path $PSScriptRoot '../artifacts/nfl-prop-dashboard/public/team-logos'
$output = Join-Path $PSScriptRoot '../artifacts/nfl-prop-dashboard/src/data/team-logo-framing.json'
$framing = [ordered]@{}

foreach ($file in (Get-ChildItem -LiteralPath $source -Filter '*.png' | Sort-Object Name)) {
  $image = [System.Drawing.Bitmap]::new($file.FullName)
  try {
    $left = $image.Width
    $top = $image.Height
    $right = 0
    $bottom = 0
    for ($y = 0; $y -lt $image.Height; $y += 8) {
      for ($x = 0; $x -lt $image.Width; $x += 8) {
        $pixel = $image.GetPixel($x, $y)
        $isWhite = $pixel.R -gt 245 -and $pixel.G -gt 245 -and $pixel.B -gt 245
        if ($pixel.A -gt 16 -and -not $isWhite) {
          $left = [Math]::Min($left, $x)
          $top = [Math]::Min($top, $y)
          $right = [Math]::Max($right, $x)
          $bottom = [Math]::Max($bottom, $y)
        }
      }
    }
    if ($left -ge $right -or $top -ge $bottom) { throw "No visible logo pixels in $($file.Name)" }

    $size = [Math]::Max($image.Width, $image.Height)
    $fraction = [Math]::Max(($right - $left) / $size, ($bottom - $top) / $size)
    $scale = 0.94 / $fraction
    $centerX = (($left + $right) / 2 - $image.Width / 2) / $size
    $centerY = (($top + $bottom) / 2 - $image.Height / 2) / $size
    $framing[$file.BaseName] = [ordered]@{
      scale = [Math]::Round($scale, 3)
      x = [Math]::Round(-$centerX * $scale * 100, 2)
      y = [Math]::Round(-$centerY * $scale * 100, 2)
    }
  } finally {
    $image.Dispose()
  }
}

$framing | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $output -Encoding utf8
Write-Output "Generated framing for $($framing.Count) logos."
