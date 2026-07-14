# Vercel Setup - Step-by-Step Guide

## Required Staging/Production Separation

Keep the vendor-facing staging site in the separate Vercel project
`snapcase-staging`. The production site uses `snapcase_app_v2`.

- `https://staging.snapcase.ai` must remain attached to `snapcase-staging`.
- Build staging with `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_SUPABASE_PROJECT_ID` for
  `snapcase-onshore-staging` (`onztuktjcmjukfhcuphh`).
- Build production with the production Supabase project and keep its domain on
  `snapcase_app_v2`.
- Do not use a branch-scoped Vercel preview alias or a Vercel bypass token as the
  vendor test URL. A production deploy must not be able to replace the staging
  domain's deployment.
- Before sending vendor test URLs, verify the public page returns HTTP 200, its
  bundle contains the staging Supabase project and no production project, and
  the staging Edge Function returns CORS `Access-Control-Allow-Origin:
  https://staging.snapcase.ai`.

## 🎯 What You Need Before Starting

1. ✅ Your code pushed to GitHub (if not already)
2. ✅ Your Supabase project URL and keys ready
3. ✅ Vercel account (you already have this!)

## 📋 Step-by-Step Instructions

### Step 1: Get Your Supabase Credentials

Before setting up Vercel, you'll need these from your Supabase project:

1. **Go to Supabase Dashboard:**
   - Visit: https://supabase.com/dashboard/project/mdprdbaykuordozfctud
   - Or: https://app.supabase.com → Select your project

2. **Get Your Project URL:**
   - Go to: **Settings** → **API**
   - Copy the **Project URL**
   - It should look like: `https://mdprdbaykuordozfctud.supabase.co`

3. **Get Your Anon/Public Key:**
   - Still in **Settings** → **API**
   - Copy the **anon public** key (the one labeled "anon" or "public")
   - This is safe to use in frontend code

**Keep these handy - you'll need them in Step 4!**

---

### Step 2: Create New Project in Vercel

1. **Go to Vercel Dashboard:**
   - Visit: https://vercel.com/dashboard
   - Make sure you're logged in

2. **Add New Project:**
   - Click the **"Add New..."** button (top right)
   - Select **"Project"** from the dropdown

3. **Import Your Repository:**
   - You'll see a list of your GitHub repositories
   - Find and click on **`Snapcase_AppV2`** (or whatever your repo is named)
   - Click **"Import"**

---

### Step 3: Configure Project Settings

Vercel should auto-detect your Vite setup, but verify these settings:

**Framework Preset:** 
- Should show: **Vite** ✅
- If not, select "Vite" from the dropdown

**Root Directory:**
- Leave as: `./` (default)

**Build Command:**
- Should show: `npm run build` ✅
- If not, type: `npm run build`

**Output Directory:**
- Should show: `dist` ✅
- If not, type: `dist`

**Install Command:**
- Should show: `npm install` ✅
- If not, type: `npm install`
Note: Vercel uses `npm install`; for local verification use `npm ci` (see `AGENTS.md`).

**Click "Continue" or "Next"** (don't deploy yet!)

---

### Step 4: Add Environment Variables ⚠️ **MOST IMPORTANT STEP**

**Before deploying, you MUST add these environment variables:**

1. **Click on "Environment Variables"** (or look for the section to add them)

2. **Add First Variable:**
   - **Name:** `VITE_SUPABASE_URL`
   - **Value:** Paste your Supabase Project URL (from Step 1)
     - Example: `https://mdprdbaykuordozfctud.supabase.co`
   - **Environments:** Check all three boxes:
     - ✅ Production
     - ✅ Preview  
     - ✅ Development

3. **Click "Add" or "Save"**

4. **Add Second Variable:**
   - **Name:** `VITE_SUPABASE_PUBLISHABLE_KEY`
   - **Value:** Paste your Supabase anon/public key (from Step 1)
   - **Environments:** Check all three boxes:
     - ✅ Production
     - ✅ Preview
     - ✅ Development

5. **Click "Add" or "Save"**

**Important Notes:**
- ✅ These are the ONLY two variables you need in Vercel
- ✅ Backend secrets (PRINTFUL_API_KEY, STRIPE_SECRET_KEY) stay in Supabase Edge Functions
- ✅ Make sure variable names match EXACTLY (case-sensitive!)

---

### Step 5: Deploy!

1. **Review your settings** one more time
2. **Click "Deploy"** button
3. **Wait 2-3 minutes** for the build to complete
4. You'll see build logs in real-time

**What happens:**
- Vercel installs dependencies (`npm install`)
- Builds your app (`npm run build`)
- Deploys to a URL like: `https://snapcase-app-v2.vercel.app`

---

### Step 6: Get Your Deployment URL

After deployment completes:

1. **You'll see a success message** with your deployment URL
2. **Copy the URL** - it will look like:
   - `https://snapcase-app-v2-abc123.vercel.app` (first deployment)
   - Or your custom domain if you set one up

3. **Click the URL** to visit your live site!

---

### Step 7: Update Supabase CORS (Critical!)

Your Edge Functions need to allow requests from your Vercel domain.

**Option A: Update Each Function (Recommended)**

I can help you update the Edge Functions to allow your Vercel domain. Just provide me your Vercel URL after deployment.

**Option B: Quick Test First**

For now, you can test if everything works. If you see CORS errors in the browser console, we'll need to update the functions.

---

### Step 8: Test Your Deployment

1. **Visit your Vercel URL**
2. **Open browser console** (F12 → Console tab)
3. **Test the app:**
   - Navigate through pages
   - Try the EDM preview
   - Check for any errors in console

**What to look for:**
- ✅ No CORS errors
- ✅ EDM preview loads
- ✅ Functions work correctly
- ✅ No 404 or 500 errors

---

## 🔄 What Happens Next (Automatic!)

**Good news:** Once set up, Vercel automatically:

- ✅ **Deploys on every merge** to `main` (via PRs; direct pushes are not allowed, see `AGENTS.md`) → Production
- ✅ **Creates preview URLs** for every pull request
- ✅ **Redeploys** when you push new commits

You don't need to do anything manually after this!

---

## 🆘 Troubleshooting

### Build Fails

**Check:**
- Build logs in Vercel dashboard (scroll down to see errors)
- Make sure `npm run build` works locally first
- Verify all environment variables are set correctly

### "Environment Variable Not Found" Error

**Fix:**
- Go to Vercel → Your Project → Settings → Environment Variables
- Verify both variables are added
- Make sure they're enabled for the right environment (Production/Preview/Development)
- Redeploy after adding variables

### CORS Errors in Browser

**Fix:**
- This means we need to update Edge Functions
- Provide me your Vercel URL and I'll update the functions
- Or we can add a wildcard for `*.vercel.app` domains

### Functions Don't Work

**Check:**
- Browser console for error messages
- Supabase Dashboard → Edge Functions → Logs
- Verify functions are deployed (we already did this!)

---

## ✅ Success Checklist

After setup, verify:

- [ ] Project imported to Vercel
- [ ] Environment variables added (`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`)
- [ ] First deployment successful
- [ ] Can visit your Vercel URL
- [ ] No build errors
- [ ] App loads correctly
- [ ] (After CORS update) EDM preview works
- [ ] (After CORS update) All functions work

---

## 📝 Next Steps After Setup

1. **Share your Vercel URL with me** - I'll update the Edge Functions to allow it
2. **Test everything** - Make sure all features work
3. **Set up custom domain** (optional, later) - Connect `snapcase.ai` in Vercel Settings → Domains

---

## 🎉 You're Done!

Once these steps are complete, your app will be live and automatically update on every code push!

**Need help?** Just ask me (Cursor AI) and I'll guide you through any step!


