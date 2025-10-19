#!/bin/bash
# cleanup-secrets.sh
# Script to clean up accidentally committed secrets and prepare for secure deployment

echo "🔒 Cleaning up accidentally committed secrets..."

# Check if we're in the right directory
if [ ! -f "src/backend/schema.prisma" ]; then
    echo "❌ Error: Please run this script from the google-meet-meeting-bot directory"
    exit 1
fi

# 1. Remove hardcoded password from schema.prisma
echo "📝 Updating database schema to use environment variable..."
if grep -q "supersecret" src/backend/schema.prisma; then
    sed -i 's/supersecret/CHANGE_ME/g' src/backend/schema.prisma
    echo "✅ Updated schema.prisma - replaced hardcoded password"
else
    echo "ℹ️  Schema.prisma already uses environment variable"
fi

# 2. Update docker-compose.yml to use environment variable
echo "🐳 Updating docker-compose.yml to use environment variable..."
if grep -q "POSTGRES_PASSWORD: supersecret" docker-compose.yml; then
    sed -i 's/POSTGRES_PASSWORD: supersecret/POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}/g' docker-compose.yml
    echo "✅ Updated docker-compose.yml - now uses POSTGRES_PASSWORD environment variable"
else
    echo "ℹ️  docker-compose.yml already uses environment variable"
fi

# 3. Create .env.example file
echo "📄 Creating .env.example file..."
cat > .env.example << 'EOF'
# Database Configuration
DATABASE_URL=postgresql://meetingbot:YOUR_SECURE_PASSWORD@postgres:5432/meetingbotpoc
POSTGRES_PASSWORD=your-secure-database-password

# AI Services
ASSEMBLYAI_API_KEY=your-assemblyai-api-key-here

# Google Account (dedicated for bot - NOT your personal account)
GOOGLE_ACCOUNT_USER=your-bot-google-email@gmail.com
GOOGLE_ACCOUNT_PASSWORD=your-bot-google-password

# Firebase (for ONIX integration)
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_PRIVATE_KEY=your-firebase-private-key
FIREBASE_CLIENT_EMAIL=your-firebase-client-email

# Security
NODE_ENV=development
JWT_SECRET=your-jwt-secret-for-api-authentication
EOF

echo "✅ Created .env.example file"

# 4. Update .gitignore to ensure secrets are not committed
echo "🔍 Updating .gitignore..."
if ! grep -q "\.env" .gitignore; then
    echo "" >> .gitignore
    echo "# Environment files" >> .gitignore
    echo ".env" >> .gitignore
    echo ".env.local" >> .gitignore
    echo ".env.production" >> .gitignore
    echo "✅ Added .env files to .gitignore"
else
    echo "ℹ️  .env files already in .gitignore"
fi

if ! grep -q "auth.json" .gitignore; then
    echo "auth.json" >> .gitignore
    echo "✅ Added auth.json to .gitignore"
else
    echo "ℹ️  auth.json already in .gitignore"
fi

# 5. Create secure setup instructions
echo "📋 Creating secure setup instructions..."
cat > SECURE_SETUP.md << 'EOF'
# Secure Setup Instructions

## ⚠️ CRITICAL: Security Setup Required

This script has cleaned up hardcoded secrets. You MUST complete the following steps before running the bot:

### 1. Set Secure Database Password
```bash
# Generate a secure password
openssl rand -base64 32

# Set environment variable
export POSTGRES_PASSWORD="your-generated-secure-password"

# Update .env file
echo "POSTGRES_PASSWORD=your-generated-secure-password" >> .env
```

### 2. Update Database URL
```bash
# Update .env with your secure password
sed -i 's/YOUR_SECURE_PASSWORD/your-generated-secure-password/g' .env
```

### 3. Rotate AssemblyAI API Key
- Go to [AssemblyAI Console](https://www.assemblyai.com/)
- Generate a new API key
- Update .env file with new key

### 4. Use Dedicated Google Account
- Create a new Google account specifically for the bot
- Enable 2FA on the bot account
- Use this account for GOOGLE_ACCOUNT_USER and GOOGLE_ACCOUNT_PASSWORD

### 5. Secure Firebase Credentials (for ONIX integration)
- Download Firebase service account key
- Store securely and reference in .env

## Security Checklist
- [ ] Database password changed from "supersecret"
- [ ] AssemblyAI API key rotated
- [ ] Dedicated Google account created for bot
- [ ] 2FA enabled on bot Google account
- [ ] .env file not committed to version control
- [ ] Firebase credentials secured
- [ ] All hardcoded secrets removed

## Next Steps
1. Complete security setup above
2. Run `npm run gen:auth` to generate Google session
3. Run `docker-compose up -d` to start services
4. Test bot functionality
5. Review INTEGRATION_PLAN.md for ONIX integration
EOF

echo "✅ Created SECURE_SETUP.md with security instructions"

# 6. Check for other potential secrets
echo "🔍 Scanning for other potential secrets..."
SECRETS_FOUND=0

# Check for hardcoded API keys
if grep -r -i "api_key.*=" . --exclude-dir=node_modules --exclude-dir=.git --exclude="cleanup-secrets.sh" --exclude="SECURE_SETUP.md" | grep -v "process.env" | grep -v "your-"; then
    echo "⚠️  Found potential hardcoded API keys:"
    grep -r -i "api_key.*=" . --exclude-dir=node_modules --exclude-dir=.git --exclude="cleanup-secrets.sh" --exclude="SECURE_SETUP.md" | grep -v "process.env" | grep -v "your-"
    SECRETS_FOUND=1
fi

# Check for hardcoded passwords
if grep -r -i "password.*=" . --exclude-dir=node_modules --exclude-dir=.git --exclude="cleanup-secrets.sh" --exclude="SECURE_SETUP.md" | grep -v "process.env" | grep -v "your-" | grep -v "CHANGE_ME"; then
    echo "⚠️  Found potential hardcoded passwords:"
    grep -r -i "password.*=" . --exclude-dir=node_modules --exclude-dir=.git --exclude="cleanup-secrets.sh" --exclude="SECURE_SETUP.md" | grep -v "process.env" | grep -v "your-" | grep -v "CHANGE_ME"
    SECRETS_FOUND=1
fi

# Check for hardcoded tokens
if grep -r -i "token.*=" . --exclude-dir=node_modules --exclude-dir=.git --exclude="cleanup-secrets.sh" --exclude="SECURE_SETUP.md" | grep -v "process.env" | grep -v "your-"; then
    echo "⚠️  Found potential hardcoded tokens:"
    grep -r -i "token.*=" . --exclude-dir=node_modules --exclude-dir=.git --exclude="cleanup-secrets.sh" --exclude="SECURE_SETUP.md" | grep -v "process.env" | grep -v "your-"
    SECRETS_FOUND=1
fi

if [ $SECRETS_FOUND -eq 0 ]; then
    echo "✅ No additional hardcoded secrets found"
else
    echo "⚠️  Please review and secure the secrets listed above"
fi

# 7. Final summary
echo ""
echo "🎉 Secret cleanup completed!"
echo ""
echo "📋 Next steps:"
echo "1. Read SECURE_SETUP.md for critical security steps"
echo "2. Set secure environment variables"
echo "3. Rotate all API keys and passwords"
echo "4. Test the bot with new credentials"
echo "5. Review INTEGRATION_PLAN.md for ONIX integration"
echo ""
echo "⚠️  IMPORTANT: Do not run the bot until you complete the security setup!"
echo ""
echo "🔒 Security is your responsibility - this script only cleaned up the code."
