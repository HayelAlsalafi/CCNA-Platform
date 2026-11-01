function Read-SeaweedMediaEnvironment {
  param([string]$CredentialFile = (Join-Path $env:USERPROFILE 'ccna-s3\s3.json'))
  if (!(Test-Path -LiteralPath $CredentialFile)) { return $null }
  try {
    $document = Get-Content -Raw -LiteralPath $CredentialFile | ConvertFrom-Json
    $identities = @($document.identities)
    if ($identities.Count -ne 1) { throw 'Ambiguous configuration' }
    $credentials = @($identities[0].credentials)
    if ($credentials.Count -ne 1) { throw 'Ambiguous credentials' }
    $key = $credentials[0].accessKey
    $secret = $credentials[0].secretKey
    if ($key -isnot [string] -or $secret -isnot [string] -or [string]::IsNullOrWhiteSpace($key) -or [string]::IsNullOrWhiteSpace($secret)) { throw 'Missing credentials' }
    return @{
      LESSON_MEDIA_PROVIDER = 's3'
      LESSON_MEDIA_S3_ENDPOINT = 'http://127.0.0.1:9000'
      LESSON_MEDIA_S3_REGION = 'us-east-1'
      LESSON_MEDIA_S3_BUCKET = 'ccna-lesson-media'
      LESSON_MEDIA_S3_ACCESS_KEY_ID = $key
      LESSON_MEDIA_S3_SECRET_ACCESS_KEY = $secret
    }
  } catch { throw 'Local S3 configuration rejected; expected exactly one identity with one nonempty credential pair. Details withheld.' }
  finally { $document=$null; $credentials=$null; $key=$null; $secret=$null }
}
