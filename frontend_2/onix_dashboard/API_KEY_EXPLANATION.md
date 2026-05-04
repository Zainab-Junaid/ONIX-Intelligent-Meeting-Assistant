# API Key Requirements - Simple Explanation

## ✅ ONE API Key for Everything (Summary + Notes)

**You only need ONE AssemblyAI API key** that works for both:
- ✅ **Summary Generation** (uses LeMUR)
- ✅ **Notes Generation** (uses LeMUR)

Both features use the **same API key** from your `.env.local` file:
```bash
ASSEMBLYAI_API_KEY=your-key-here
```

## 🆓 Transcription is FREE (No API Key Needed)

**Transcription does NOT use AssemblyAI at all!**

- ✅ Uses **Web Speech API** (built into your browser)
- ✅ **100% FREE** - No API key required
- ✅ Works offline (browser-based)
- ✅ No AssemblyAI account needed for transcription

## 📋 Summary

| Feature | API Key Needed? | Uses AssemblyAI? | Cost |
|---------|----------------|------------------|------|
| **Transcription** | ❌ NO | ❌ NO (Web Speech API) | 🆓 FREE |
| **Summary** | ✅ YES (same key) | ✅ YES (LeMUR) | 💰 Paid |
| **Notes** | ✅ YES (same key) | ✅ YES (LeMUR) | 💰 Paid |

## 🔑 What You Need

1. **ONE AssemblyAI API key** with LeMUR access
2. Put it in `.env.local`:
   ```bash
   ASSEMBLYAI_API_KEY=4fc97d963b464430bfb009706d15da1b
   ```
3. That's it! Both summary and notes will use this same key.

## ❓ Why the Error?

If you're getting "LeMUR access" errors, it means:
- ✅ Your API key is correct
- ❌ But your AssemblyAI account doesn't have LeMUR enabled yet

**Solution**: Upgrade your AssemblyAI plan or request LeMUR access (see `ASSEMBLYAI_SETUP.md`)

## 🎯 Quick Answer

**Q: Do I need separate keys for summary, notes, and transcription?**

**A: NO!**
- Transcription: No key needed (free, browser-based)
- Summary + Notes: Share ONE AssemblyAI API key (with LeMUR access)


