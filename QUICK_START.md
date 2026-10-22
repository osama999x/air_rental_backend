# Air Rental API

The current setup instructions are in [README.md](README.md). This file previously described the RishtaNagar matrimonial template and is no longer the source of setup steps.

# Previous RishtaNagar notes

## ✅ Migration Complete!

Your Express.js application has been successfully migrated to NestJS with TypeORM and MySQL!

## 📋 What You Need to Do Next

### 1. Set Up Environment Variables

Copy `env.template` to `.env`:

```bash
# PowerShell
Copy-Item env.template .env

# Then edit .env with your actual values
```

**Required Environment Variables:**
```env
NODE_ENV=development
PORT=3000

# MySQL Database
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=your_mysql_password
DB_DATABASE=rishtanagar

# JWT Secrets (change these!)
JWT_SECRET=your_secure_jwt_secret_key_here
REFRESH_KEY=your_secure_refresh_key_here
ACCESS_TOKEN_EXPIRES_IN=3600
REFRESH_KEY_EXPIRES_IN=36000

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your_google_client_id

# Email Configuration (for OTP)
MAIL_HOST=smtp.gmail.com
MAIL_PORT=465
MAIL_ADDRESS=your_email@gmail.com
MAIL_PASSWORD=your_gmail_app_password
```

### 2. Create MySQL Database

```sql
-- Open MySQL
mysql -u root -p

-- Create database
CREATE DATABASE rishtanagar;

-- Exit MySQL
exit
```

### 3. Start the Application

```bash
# Development mode with hot-reload
npm run start:dev
```

The application will:
- Automatically create all database tables (synchronize: true)
- Start on http://localhost:3000
- Provide API documentation at http://localhost:3000/api-docs

## 🎯 Available API Endpoints

All endpoints are prefixed with `/api/v1`

### 🔐 Authentication (Public)
- `POST /api/v1/auth/login` - Login with email/password
- `POST /api/v1/auth/signup` - Create new account
- `POST /api/v1/auth/google-login` - Login with Google
- `POST /api/v1/auth/google-signup` - Signup with Google

### 👤 Users
- `GET /api/v1/users` - Get all users (protected)
- `GET /api/v1/users/:id` - Get user by ID (protected)
- `POST /api/v1/users/send-otp` - Send OTP (public)
- `POST /api/v1/users/verify-otp` - Verify OTP (public)
- `POST /api/v1/users/reset-password` - Reset password (public)
- `POST /api/v1/users/update-details` - Update profile details (protected)
- `GET /api/v1/users/:id/profile-completion` - Get completion % (protected)

### 🏙️ Cities (Public Read)
- `GET /api/v1/cities` - Get all cities
- `GET /api/v1/cities/:id` - Get city by ID
- `POST /api/v1/cities` - Create city (protected)
- `PUT /api/v1/cities/:id` - Update city (protected)
- `DELETE /api/v1/cities/:id` - Delete city (protected)

### 🕌 Religion (Public Read)
- `GET /api/v1/religion` - Get all religions
- `GET /api/v1/religion/:id` - Get religion by ID
- `POST /api/v1/religion` - Create religion (protected)
- `PUT /api/v1/religion/:id` - Update religion (protected)
- `DELETE /api/v1/religion/:id` - Delete religion (protected)

## 🧪 Testing the API

### 1. Test Health Check
```bash
curl http://localhost:3000
```

### 2. Create a Religion (for signup)
```bash
curl -X POST http://localhost:3000/api/v1/religion \
  -H "Content-Type: application/json" \
  -d '{"name": "Islam"}'
```

### 3. Create a City (for user details)
```bash
curl -X POST http://localhost:3000/api/v1/cities \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Karachi",
    "state": "Sindh",
    "country": "Pakistan"
  }'
```

### 4. Signup a User
```bash
curl -X POST http://localhost:3000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "Password123",
    "phone": "03001234567",
    "gender": "Male",
    "profileFor": "Self",
    "religionId": "paste_religion_id_here"
  }'
```

### 5. Login
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Password123"
  }'
```

### 6. Use Protected Endpoints
```bash
curl http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 📚 Swagger Documentation

Access interactive API documentation at:
**http://localhost:3000/api-docs**

Credentials: `admin` / `admin123`

## 🗂️ Project Structure

```
src/
├── common/
│   ├── entities/          # TypeORM entities (12 entities)
│   ├── enums/             # Shared enums
│   ├── utils/             # Utility functions
│   ├── filters/           # Exception filters
│   ├── guards/            # Authentication guards
│   ├── decorators/        # Custom decorators
│   └── providers/         # Shared services (JWT)
├── city/                  # City module
├── religion/              # Religion module
├── rishtanagar-users/     # Users module
├── rishtanagar-auth/      # Authentication module
├── config/                # Configuration files
├── app.module.ts          # Main application module
└── main.ts                # Application entry point
```

## 🔑 Key Features Implemented

✅ **TypeORM + MySQL** - Full database integration
✅ **JWT Authentication** - Token-based auth with refresh tokens
✅ **Google OAuth** - Social login support
✅ **Rate Limiting** - 100 requests per 2 minutes
✅ **CORS** - Configured for cross-origin requests
✅ **Global Exception Filter** - Comprehensive error handling
✅ **Validation** - DTO validation with class-validator
✅ **Swagger/OpenAPI** - Auto-generated documentation
✅ **12 Database Entities** - Complete schema migration
✅ **OTP System** - For password reset
✅ **Profile Management** - Complete user profile system

## ⚠️ Important Notes

1. **Synchronize Mode**: Currently set to `true` for development. TypeORM will auto-create tables. For production, set to `false` and use migrations.

2. **Email OTP**: Currently logs to console. Configure SMTP settings in `.env` for actual email delivery.

3. **Google OAuth**: Requires valid `GOOGLE_CLIENT_ID`. Get it from Google Cloud Console.

4. **Rate Limiting**: Adjust in `main.ts` if needed during development.

5. **Security**: Change `JWT_SECRET` and `REFRESH_KEY` to strong random strings in production!

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Find process on port 3000
netstat -ano | findstr :3000

# Kill the process (replace PID)
taskkill /PID <PID> /F
```

### Database Connection Failed
- Check MySQL is running
- Verify credentials in `.env`
- Ensure database exists: `CREATE DATABASE rishtanagar;`

### Module Not Found Errors
```bash
npm install
```

## 📖 Read More

See `MIGRATION_GUIDE.md` for detailed migration documentation.

## 🎉 You're All Set!

Run `npm run start:dev` and start building your matrimonial platform! 🚀

