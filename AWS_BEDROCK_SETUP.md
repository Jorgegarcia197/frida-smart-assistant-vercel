# AWS Bedrock Setup Guide

This guide explains how to set up AWS Bedrock for the FRIDA Smart Assistant.

## Required Environment Variables

### **Critical: Remove NEXT_PUBLIC_ prefix for AWS credentials**

**❌ WRONG (Security Risk):**

```env
NEXT_PUBLIC_AWS_REGION=us-east-2
NEXT_PUBLIC_AWS_ACCESS_KEY_ID=your_access_key
NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY=your_secret_key
NEXT_PUBLIC_AWS_MODEL_ID=your_model_id
```

**✅ CORRECT (Secure):**

```env
# AWS Bedrock Configuration (Server-side only)
AWS_REGION=us-east-2
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_MODEL_ID=us.anthropic.claude-sonnet-4-20250514-v1:0

# Optional: For temporary credentials
AWS_SESSION_TOKEN=your_session_token
```

## Getting AWS Bedrock Credentials

### 1. **Create AWS IAM User**

1. Go to [AWS IAM Console](https://console.aws.amazon.com/iam/)
2. Click "Users" → "Create user"
3. Choose "Programmatic access"
4. Attach the `AmazonBedrockFullAccess` policy
5. Copy the Access Key ID and Secret Access Key

### 2. **Enable Bedrock Models**

1. Go to [AWS Bedrock Console](https://console.aws.amazon.com/bedrock/)
2. Navigate to "Model access" in the left sidebar
3. Request access to the models you need:
   - Claude Sonnet 4 (for chat)
   - Any other models you plan to use

### 3. **Get Your Model ID**

Common model IDs:

- `us.anthropic.claude-sonnet-4-20250514-v1:0` (Claude Sonnet 4)
- `us.anthropic.claude-3-5-sonnet-20241022-v2:0` (Claude 3.5 Sonnet)
- `us.anthropic.claude-3-haiku-20240307-v1:0` (Claude 3 Haiku)

## Production Deployment

### **Vercel Deployment**

1. Go to your Vercel project dashboard
2. Navigate to "Settings" → "Environment Variables"
3. Add the following variables:

```env
AWS_REGION=us-east-2
AWS_ACCESS_KEY_ID=your_production_access_key
AWS_SECRET_ACCESS_KEY=your_production_secret_key
AWS_MODEL_ID=us.anthropic.claude-sonnet-4-20250514-v1:0
```

### **Other Platforms**

Ensure these environment variables are set in your production environment:

- Never use `NEXT_PUBLIC_` prefix for AWS credentials
- Keep credentials secure and never commit them to version control
- Use IAM roles when possible (for AWS deployments)

## Testing Your Configuration

1. **Local Testing**: Run the app locally and check the console logs
2. **Environment Check**: The app includes an environment check component (development only)
3. **API Testing**: Try sending a message and check for authentication errors

## Troubleshooting

### **"Security token invalid" Error**

This usually means:

1. **Wrong credentials**: Double-check your AWS Access Key ID and Secret Access Key
2. **Expired credentials**: Generate new credentials if using temporary ones
3. **Wrong region**: Ensure `AWS_REGION` matches where your Bedrock models are available
4. **Missing permissions**: Ensure your IAM user has `AmazonBedrockFullAccess` policy

### **"Model access denied" Error**

1. Go to [AWS Bedrock Console](https://console.aws.amazon.com/bedrock/)
2. Navigate to "Model access"
3. Request access to the specific model you're trying to use

### **Environment Variable Issues**

1. Check that you're NOT using `NEXT_PUBLIC_` prefix for AWS credentials
2. Ensure all required variables are set in your production environment
3. Restart your application after changing environment variables

## Security Best Practices

1. **Never expose AWS credentials to the client side**
2. **Use IAM roles when deploying to AWS**
3. **Rotate credentials regularly**
4. **Use least privilege principle** - only grant necessary permissions
5. **Monitor usage** through AWS CloudTrail

## Complete Environment Variables List

```env
# AWS Bedrock (Server-side only)
AWS_REGION=us-east-2
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_MODEL_ID=us.anthropic.claude-sonnet-4-20250514-v1:0

# Firebase Configuration
FIREBASE_SERVICE_ACCOUNT='{"type": "service_account", ...}'
FIREBASE_STORAGE_BUCKET="your-project-id.appspot.com"

# NextAuth Configuration
NEXTAUTH_SECRET="your-nextauth-secret"
NEXTAUTH_URL="https://your-production-domain.com"

# Firebase Client Configuration (can be public)
NEXT_PUBLIC_FIREBASE_API_KEY="your-firebase-api-key"
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="your-project-id.firebaseapp.com"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="your-project-id"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="your-project-id.appspot.com"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="your-messaging-sender-id"
NEXT_PUBLIC_FIREBASE_APP_ID="your-app-id"

# Azure OpenAI (if using)
NEXT_PUBLIC_OPENAI_RESOURCE_NAME="your-azure-openai-resource"
NEXT_PUBLIC_OPENAI_API_KEY="your-azure-openai-key"
NEXT_PUBLIC_AZURE_EMBEDDING_DEPLOYMENT="your-embedding-deployment"
```
