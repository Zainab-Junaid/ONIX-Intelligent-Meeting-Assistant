# AssemblyAI Setup Guide

## Step 1: Set Up Your API Key

1. Create a `.env.local` file in the `frontend/onix_dashboard` directory (if it doesn't exist)

2. Add your AssemblyAI API key:
   ```bash
   ASSEMBLYAI_API_KEY=4fc97d963b464430bfb009706d15da1b
   ```

3. **Restart your Next.js development server** for the changes to take effect:
   ```bash
   # Stop the server (Ctrl+C) and restart:
   npm run dev
   ```

## Step 2: Upgrade to LeMUR Access

To use AI-powered summaries and notes, you need LeMUR access. Here's how to upgrade:

### Option A: Upgrade Your Plan (Recommended)

1. **Go to AssemblyAI Console**: https://www.assemblyai.com/app/account
2. **Sign in** to your account
3. **Navigate to Billing/Plans** section
4. **Upgrade to a plan that includes LeMUR**:
   - **Starter Plan** ($0.10/hour) - Includes LeMUR
   - **Growth Plan** ($0.05/hour) - Includes LeMUR
   - **Enterprise** - Contact sales for custom pricing

### Option B: Request Access (Free Tier)

1. **Contact AssemblyAI Support**:
   - Email: support@assemblyai.com
   - Subject: "Request LeMUR Access"
   - Include: Your account email and use case

2. **Wait for approval** (usually within 24-48 hours)

### Option C: Use Free Trial Credits

1. **Check your account** at https://www.assemblyai.com/app/account
2. **Look for free trial credits** - New accounts often get $5-10 in free credits
3. **These credits include LeMUR access** during the trial period

## Step 3: Verify Your Setup

After setting up your API key and getting LeMUR access:

1. **Start your dashboard**:
   ```bash
   cd frontend/onix_dashboard
   npm run dev
   ```

2. **Test the extension**:
   - Start a meeting capture
   - Speak for a few minutes
   - Wait 2 minutes for auto-notes
   - Stop capture to generate summary

3. **Check the console** for any errors

## Troubleshooting

### Error: "Your account does not have access to LeMUR"

**Solution**: Follow Step 2 above to upgrade or request access.

### Error: "ASSEMBLYAI_API_KEY not found"

**Solution**: 
- Make sure `.env.local` file exists in `frontend/onix_dashboard/`
- Make sure the file contains: `ASSEMBLYAI_API_KEY=your-key-here`
- Restart your Next.js server

### Error: "Failed to fetch" or Network errors

**Solution**:
- Make sure your dashboard is running at `http://localhost:3000`
- Check that the extension is pointing to the correct dashboard URL
- Check your firewall/antivirus settings

## Current API Key

Your current API key: `4fc97d963b464430bfb009706d15da1b`

**Note**: Make sure this key has LeMUR access enabled. If you're still getting LeMUR errors, you may need to:
1. Generate a new API key from your AssemblyAI dashboard
2. Update the `.env.local` file with the new key
3. Restart your server

## Need Help?

- **AssemblyAI Docs**: https://www.assemblyai.com/docs
- **AssemblyAI Support**: support@assemblyai.com
- **LeMUR Documentation**: https://www.assemblyai.com/docs/lemur


