# Vercel Deployment Guide - Simple Steps

## 🎯 Goal
Deploy your Snapcase app to Vercel so it's live on the internet.

## ⏱️ Time Required: 15-20 minutes

## 📋 Prerequisites
- ✅ Your code is in a GitHub repository
- ✅ You have a GitHub account
- ✅ You have a Vercel account (free to create)

## 🚀 Step-by-Step Instructions

### Step 1: Create Vercel Account (if needed)

1. Go to [vercel.com](https://vercel.com)
2. Click "Sign Up"
3. Choose "Continue with GitHub"
4. Authorize Vercel to access your GitHub

### Step 2: Import Your Project

1. In Vercel dashboard, click "Add New..." → "Project"
2. Find your `Snapcase_AppV2` repository
3. Click "Import"

### Step 3: Configure Project Settings

Vercel will auto-detect your Vite setup, but verify:

**Framework Preset:** Vite (should be auto-detected)

**Root Directory:** `./` (leave as default)

**Build Command:** `npm run build` (should be auto-filled)

**Output Directory:** `dist` (should be auto-filled)

**Install Command:** `npm install` (should be auto-filled)

### Step 4: Add Environment Variables

**This is the most important step!**

Click "Environment Variables" and add:

```
VITE_SUPABASE_URL
```
- Value: Your Supabase project URL
- Example: `https://mdprdbaykuordozfctud.supabase.co`
- Add to: Production, Preview, Development

```
VITE_SUPABASE_PUBLISHABLE_KEY
```
- Value: Your Supabase anon/public key
- Get it from: Supabase Dashboard → Settings → API
- Add to: Production, Preview, Development

**Note:** Backend secrets (PRINTFUL_API_KEY, STRIPE_SECRET_KEY) stay in Supabase Edge Functions, not here.

### Step 5: Deploy!

1. Click "Deploy"
2. Wait 2-3 minutes for build to complete
3. You'll get a URL like: `https://snapcase-app-v2.vercel.app`

### Step 6: Update Supabase CORS (Important!)

After deployment, you need to allow your Vercel domain:

1. Go to Supabase Dashboard → Settings → API
2. Find "CORS" or "Allowed Origins"
3. Add your Vercel URL:
   - `https://snapcase-app-v2.vercel.app`
   - `https://*.vercel.app` (for preview deployments)

**Or** update your Edge Functions to allow Vercel domains.

### Step 7: Test Your Deployment

1. Visit your Vercel URL
2. Test the EDM preview
3. Verify all functions work
4. Check browser console for errors

## 🔄 Automatic Deployments

**Good News:** Once set up, Vercel automatically deploys:
- ✅ Every push to `main` branch → Production
- ✅ Every pull request → Preview deployment
- ✅ Every commit → Preview URL

## 🔧 Troubleshooting

### Build Fails
- Check build logs in Vercel dashboard
- Verify all environment variables are set
- Make sure `npm run build` works locally first

### Functions Don't Work
- Check Supabase CORS settings
- Verify Edge Functions are deployed
- Check browser console for errors

### Environment Variables Not Working
- Make sure they start with `VITE_` (for Vite)
- Redeploy after adding variables
- Check variable names match exactly

## 📝 Custom Domain (Optional - Later)

When ready to use `snapcase.ai`:

1. In Vercel: Settings → Domains
2. Add your domain
3. Follow DNS setup instructions
4. Update Supabase CORS with your custom domain

## ✅ Success Checklist

- [ ] Project imported to Vercel
- [ ] Environment variables added
- [ ] First deployment successful
- [ ] Supabase CORS updated
- [ ] EDM preview works
- [ ] All functions working
- [ ] No console errors

## 🆘 Need Help?

If you get stuck:
1. Check Vercel deployment logs
2. Check browser console for errors
3. Ask me (Cursor AI) for specific issues
4. Vercel has great docs: [vercel.com/docs](https://vercel.com/docs)

## 🎉 You're Done!

Your app is now live! Every time you push code, it automatically updates.

