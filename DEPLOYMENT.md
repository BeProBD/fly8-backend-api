# Fly8 Deployment Guide

## Overview
This guide covers deploying Fly8 to production environments using industry-standard platforms.

## Architecture Overview

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Vercel    │─────▶│    Render    │─────▶│  MongoDB    │
│  (Frontend) │      │   (Backend)  │      │   Atlas     │
└─────────────┘      └──────────────┘      └─────────────┘
```

## Prerequisites

- GitHub account
- MongoDB Atlas account
- Vercel account (for frontend)
- Render account (for backend)
- Domain name (optional)

---

## Part 1: MongoDB Atlas Setup

### Step 1: Create Database

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a new project named "Fly8"
3. Build a cluster (Free tier is sufficient for development)
4. Choose your cloud provider and region
5. Wait for cluster creation (2-3 minutes)

### Step 2: Configure Network Access

1. Go to **Network Access** → **Add IP Address**
2. Click **Allow Access from Anywhere** (0.0.0.0/0)
3. Confirm

### Step 3: Create Database User

1. Go to **Database Access** → **Add New Database User**
2. Choose **Password** authentication
3. Username: `fly8_admin`
4. Password: Generate strong password (save it!)
5. Set role to **Atlas Admin**
6. Add User

### Step 4: Get Connection String

1. Click **Connect** on your cluster
2. Choose **Connect your application**
3. Copy the connection string:
   ```
   mongodb+srv://fly8_admin:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
4. Replace `<password>` with your actual password
5. Save this string securely

---

## Part 2: Backend Deployment (Render)

### Step 1: Prepare Repository

1. Create GitHub repository: `fly8-backend`
2. Push only the `/backend` folder contents:

```bash
cd /path/to/fly8
git init
git add backend/
git commit -m "Initial backend commit"
git remote add origin https://github.com/yourusername/fly8-backend.git
git push -u origin main
```

### Step 2: Deploy to Render

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **New +** → **Web Service**
3. Connect your GitHub repository
4. Configure:

```yaml
Name: fly8-backend
Environment: Node
Region: Choose closest to your users
Branch: main
Build Command: yarn install
Start Command: node server_express.js
Instance Type: Free (or Starter for production)
```

### Step 3: Add Environment Variables

Click **Environment** and add:

```env
MONGO_URL=mongodb+srv://fly8_admin:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/
DB_NAME=fly8_database
CORS_ORIGINS=https://your-frontend-domain.vercel.app
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
PORT=8001
RESEND_API_KEY=re_your_resend_key_if_using
SENDER_EMAIL=onboarding@resend.dev
NODE_ENV=production
```

**Important:** 
- Replace MongoDB password
- Update `CORS_ORIGINS` with your actual frontend URL
- Generate strong JWT secret (32+ characters)

### Step 4: Deploy

1. Click **Create Web Service**
2. Wait for deployment (3-5 minutes)
3. Note your backend URL: `https://fly8-backend.onrender.com`

### Step 5: Initialize Services

```bash
curl -X POST https://fly8-backend.onrender.com/api/services/init
```

Expected response:
```json
{"message":"Services initialized","count":8}
```

---

## Part 3: Frontend Deployment (Vercel)

### Step 1: Prepare Repository

1. Create GitHub repository: `fly8-frontend`
2. Push only the `/frontend` folder contents:

```bash
cd /path/to/fly8/frontend
git init
git add .
git commit -m "Initial frontend commit"
git remote add origin https://github.com/yourusername/fly8-frontend.git
git push -u origin main
```

### Step 2: Deploy to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **Add New** → **Project**
3. Import your `fly8-frontend` repository
4. Configure:

```yaml
Framework Preset: Create React App
Root Directory: ./
Build Command: yarn build
Output Directory: build
Install Command: yarn install
```

### Step 3: Add Environment Variables

Click **Environment Variables** and add:

```env
REACT_APP_BACKEND_URL=https://fly8-backend.onrender.com
```

**Important:** Use your actual Render backend URL

### Step 4: Deploy

1. Click **Deploy**
2. Wait for deployment (2-4 minutes)
3. Your app will be live at: `https://fly8-frontend.vercel.app`

### Step 5: Update Backend CORS

Go back to Render dashboard:

1. Open your backend service
2. Go to **Environment**
3. Update `CORS_ORIGINS`:
   ```
   https://fly8-frontend.vercel.app
   ```
4. Save and redeploy

---

## Part 4: Custom Domain (Optional)

### Frontend Domain (Vercel)

1. Go to your Vercel project → **Settings** → **Domains**
2. Add your domain: `app.fly8.global`
3. Configure DNS records as shown by Vercel
4. Wait for SSL certificate (automatic)

### Backend Domain (Render)

1. Go to your Render service → **Settings** → **Custom Domain**
2. Add your domain: `api.fly8.global`
3. Configure DNS records as shown by Render
4. Wait for SSL certificate (automatic)

### Update Environment Variables

After adding custom domains:

**Frontend (.env):**
```env
REACT_APP_BACKEND_URL=https://api.fly8.global
```

**Backend (CORS_ORIGINS):**
```env
CORS_ORIGINS=https://app.fly8.global
```

---

## Part 5: Post-Deployment Setup

### Step 1: Create Admin User

```bash
curl -X POST https://api.fly8.global/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Admin",
    "lastName": "User",
    "email": "admin@fly8.global",
    "password": "SecurePassword123!",
    "role": "super_admin"
  }'
```

### Step 2: Test Login

1. Visit `https://app.fly8.global/login`
2. Login with admin credentials
3. Verify all features work

### Step 3: Create Test Data

Create sample counselor, agent, and student accounts for testing.

---

## Part 6: Monitoring & Maintenance

### Health Checks

**Backend Health:**
```bash
curl https://api.fly8.global/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "uptime": 12345
}
```

### Logs

**Render Logs:**
- Go to your service → **Logs** tab
- Monitor real-time logs
- Set up log drains for persistent storage

**Vercel Logs:**
- Go to your deployment → **Functions** tab
- View function logs and errors

### Monitoring Tools

**Recommended:**
- **Uptime Monitoring:** UptimeRobot, Pingdom
- **Error Tracking:** Sentry
- **Analytics:** Mixpanel, Amplitude
- **APM:** New Relic, DataDog

---

## Part 7: Backup Strategy

### Database Backups

**MongoDB Atlas:**
1. Go to your cluster
2. **Backup** tab
3. Enable **Continuous Cloud Backup**
4. Configure retention policy (7-30 days)

**Manual Backup:**
```bash
mongodump --uri="your-connection-string" --out=/backup/fly8-$(date +%Y%m%d)
```

### Application Backups

- GitHub: Version control
- Vercel: Automatic deployment history
- Render: Automatic deployment history

---

## Part 8: Scaling Considerations

### Database Scaling

**When to scale:**
- More than 500 concurrent users
- Database size > 512MB (free tier limit)
- Response time > 500ms

**How to scale:**
1. Go to MongoDB Atlas cluster
2. Click **Edit Configuration**
3. Upgrade to M10+ tier
4. Enable auto-scaling

### Backend Scaling

**Render Auto-scaling:**
1. Go to service **Settings**
2. Upgrade to **Pro** plan
3. Enable **Auto-scaling**
4. Set min/max instances

### Frontend Scaling

Vercel automatically scales - no action needed.

---

## Part 9: Security Checklist

- [ ] Change default JWT secret
- [ ] Use strong database passwords
- [ ] Enable MongoDB IP whitelist (production)
- [ ] Set up SSL certificates (automatic on Vercel/Render)
- [ ] Configure CORS properly
- [ ] Enable rate limiting
- [ ] Set up Sentry for error tracking
- [ ] Regular dependency updates
- [ ] Enable 2FA on all accounts
- [ ] Regular security audits

---

## Part 10: Troubleshooting

### Common Issues

**Issue: Frontend can't connect to backend**
- Check CORS_ORIGINS in backend
- Verify REACT_APP_BACKEND_URL in frontend
- Check browser console for errors

**Issue: Database connection failed**
- Verify MongoDB connection string
- Check IP whitelist (0.0.0.0/0 for development)
- Verify database user credentials

**Issue: Socket.io not working**
- Check that backend URL includes protocol (https://)
- Verify CORS settings
- Check browser console for connection errors

**Issue: 502 Bad Gateway on Render**
- Check build logs for errors
- Verify start command is correct
- Check if port 8001 is being used

### Debug Mode

**Enable debug logs:**

Backend:
```env
NODE_ENV=development
DEBUG=*
```

Frontend:
```javascript
localStorage.setItem('debug', 'socket.io-client:*');
```

---

## Part 11: Cost Optimization

### Free Tier Limits

**MongoDB Atlas Free (M0):**
- Storage: 512 MB
- RAM: Shared
- Good for: Development, small apps

**Render Free:**
- Sleeps after 15 min inactivity
- 750 hours/month free
- Good for: Development only

**Vercel Hobby (Free):**
- Unlimited deployments
- 100 GB bandwidth/month
- Good for: Development and small production

### Recommended Production Setup

**Small (< 1000 users):**
- MongoDB Atlas M10: $57/month
- Render Starter: $7/month
- Vercel Pro: $20/month
- **Total: ~$84/month**

**Medium (1000-10,000 users):**
- MongoDB Atlas M20: $105/month
- Render Pro: $85/month (auto-scaling)
- Vercel Pro: $20/month
- **Total: ~$210/month**

---

## Support

For deployment issues:
- Render: https://render.com/docs
- Vercel: https://vercel.com/docs
- MongoDB: https://docs.atlas.mongodb.com

## Next Steps

1. Set up CI/CD with GitHub Actions
2. Configure staging environment
3. Set up monitoring and alerts
4. Create backup automation
5. Document API for team

---

**Deployment Complete! 🚀**

Your Fly8 application is now live and production-ready.
