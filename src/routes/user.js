const express = require('express');
const { body, validationResult } = require('express-validator');
const passport = require('passport');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// Middleware to protect routes
const authenticate = passport.authenticate('jwt', { session: false });

// Get current user profile
router.get('/profile', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { 
        id: true, 
        email: true, 
        name: true, 
        avatar: true,
        createdAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get statistics
    const stats = await prisma.$transaction([
      prisma.task.count({
        where: { 
          userId: req.user.id, 
          isComplete: false, 
          isDeleted: false 
        }
      }),
      prisma.task.count({
        where: { 
          userId: req.user.id, 
          isComplete: true, 
          isDeleted: false 
        }
      }),
      prisma.project.count({
        where: { userId: req.user.id }
      }),
      prisma.task.count({
        where: { 
          userId: req.user.id, 
          isDeleted: true 
        }
      })
    ]);

    res.json({
      user: {
        ...user,
        stats: {
          pendingTasks: stats[0],
          completedTasks: stats[1],
          projects: stats[2],
          trashItems: stats[3]
        }
      }
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ message: 'Server error while fetching profile' });
  }
});

// Update user profile
router.put('/profile', [
  authenticate,
  body('name').optional().trim().isLength({ min: 1 }).withMessage('Name cannot be empty'),
  body('avatar').optional().isURL().withMessage('Avatar must be a valid URL')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, avatar } = req.body;
    const updateData = {};

    if (name !== undefined) updateData.name = name;
    if (avatar !== undefined) updateData.avatar = avatar;

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: { id: true, email: true, name: true, avatar: true }
    });

    res.json({ user, message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: 'Server error while updating profile' });
  }
});

// Change password (for email/password users)
router.put('/password', [
  authenticate,
  body('currentPassword').exists().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user has a password (OAuth users might not)
    if (!user.password) {
      return res.status(400).json({ message: 'Cannot change password for OAuth accounts' });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ message: 'Server error while changing password' });
  }
});

// Delete account
router.delete('/account', authenticate, async (req, res) => {
  try {
    // This will cascade delete all related data (tasks, projects) due to the schema
    await prisma.user.delete({
      where: { id: req.user.id }
    });

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ message: 'Server error while deleting account' });
  }
});

module.exports = router;