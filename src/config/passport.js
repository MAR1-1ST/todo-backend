const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const bcrypt = require('bcryptjs');

module.exports = (passport) => {
  // JWT Strategy for API authentication
  passport.use(
    new JwtStrategy(
      {
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        secretOrKey: process.env.JWT_SECRET || 'fallback-secret-key',
      },
      async (jwt_payload, done) => {
        try {
          const user = await prisma.user.findUnique({
            where: { id: jwt_payload.id },
            select: { id: true, email: true, name: true, avatar: true }
          });

          if (user) {
            return done(null, user);
          }
          return done(null, false);
        } catch (error) {
          return done(error, false);
        }
      }
    )
  );

  // Local Strategy for email/password authentication
  passport.use(
    new LocalStrategy(
      { usernameField: 'email' },
      async (email, password, done) => {
        try {
          const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() }
          });

          if (!user) {
            return done(null, false, { message: 'Invalid credentials' });
          }

          // Check if user has a password (OAuth users might not)
          if (!user.password) {
            return done(null, false, { message: 'Please use Google login' });
          }

          const isMatch = await bcrypt.compare(password, user.password);
          if (isMatch) {
            return done(null, { id: user.id, email: user.email, name: user.name, avatar: user.avatar });
          }
          return done(null, false, { message: 'Invalid credentials' });
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  // Google OAuth Strategy
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback',
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Check if user already exists
          let user = await prisma.user.findUnique({
            where: { googleId: profile.id }
          });

          if (user) {
            // Update user info if needed
            user = await prisma.user.update({
              where: { googleId: profile.id },
              data: {
                name: profile.displayName,
                avatar: profile.photos[0]?.value,
                email: profile.emails[0].value
              }
            });
            return done(null, user);
          }

          // Check if user exists with same email
          const existingUserWithEmail = await prisma.user.findUnique({
            where: { email: profile.emails[0].value }
          });

          if (existingUserWithEmail) {
            // Link Google account to existing user
            user = await prisma.user.update({
              where: { email: profile.emails[0].value },
              data: {
                googleId: profile.id,
                name: profile.displayName,
                avatar: profile.photos[0]?.value
              }
            });
            return done(null, user);
          }

          // Create new user
          user = await prisma.user.create({
            data: {
              googleId: profile.id,
              email: profile.emails[0].value,
              name: profile.displayName,
              avatar: profile.photos[0]?.value
            }
          });

          return done(null, user);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );
};