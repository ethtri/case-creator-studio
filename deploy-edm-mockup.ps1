# Deploy edm-mockup Supabase Function
# Run this script after logging in to Supabase

$PROJECT_REF = "jwlwymzyqfxulmldfijo"

Write-Host "Step 1: Logging in to Supabase..." -ForegroundColor Cyan
npx supabase login

Write-Host "`nStep 2: Linking project..." -ForegroundColor Cyan
npx supabase link --project-ref $PROJECT_REF

Write-Host "`nStep 3: Deploying edm-mockup function..." -ForegroundColor Cyan
npx supabase functions deploy edm-mockup --project-ref $PROJECT_REF

Write-Host "`n✅ Deployment complete! You can now test the EDM preview." -ForegroundColor Green

