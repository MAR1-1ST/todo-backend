const express = require('express');
const { body, validationResult, query } = require('express-validator');
const passport = require('passport');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// Middleware to protect routes
const authenticate = passport.authenticate('jwt', { session: false });

// Get all tasks with filters
router.get('/', [
  authenticate,
  query('status').optional().isIn(['all', 'complete', 'incomplete']),
  query('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH']),
  query('projectId').optional().isUUID(),
  query('search').optional().trim(),
  query('view').optional().isIn(['today', 'upcoming', 'completed', 'trash'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { status, priority, projectId, search, view } = req.query;
    const userId = req.user.id;

    // Build where clause
    let where = { userId };

    // View-based filtering
    if (view === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      where.AND = [
        { isDeleted: false },
        { dueDate: { gte: today, lt: tomorrow } }
      ];
    } else if (view === 'upcoming') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      where.AND = [
        { isDeleted: false },
        { dueDate: { gte: today } }
      ];
    } else if (view === 'completed') {
      where.isComplete = true;
      where.isDeleted = false;
    } else if (view === 'trash') {
      where.isDeleted = true;
    } else {
      where.isDeleted = false;
    }

    // Status filtering
    if (status === 'complete') {
      where.isComplete = true;
    } else if (status === 'incomplete') {
      where.isComplete = false;
    }

    // Priority filtering
    if (priority) {
      where.priority = priority;
    }

    // Project filtering
    if (projectId) {
      where.projectId = projectId;
    }

    // Search functionality
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        project: {
          select: { id: true, name: true, color: true }
        }
      },
      orderBy: [
        { dueDate: 'asc' },
        { priority: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    res.json({ tasks });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ message: 'Server error while fetching tasks' });
  }
});

// Get single task
router.get('/:id', authenticate, async (req, res) => {
  try {
    const task = await prisma.task.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      },
      include: {
        project: {
          select: { id: true, name: true, color: true }
        }
      }
    });

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    res.json({ task });
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({ message: 'Server error while fetching task' });
  }
});

// Create new task
router.post('/', [
  authenticate,
  body('title').notEmpty().trim().withMessage('Title is required'),
  body('description').optional().trim(),
  body('dueDate').optional().isISO8601().toDate(),
  body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH']),
  body('projectId').optional().isUUID()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, description, dueDate, priority, projectId } = req.body;
    const userId = req.user.id;

    // Verify project ownership if projectId is provided
    if (projectId) {
      const project = await prisma.project.findFirst({
        where: { id: projectId, userId }
      });

      if (!project) {
        return res.status(400).json({ message: 'Invalid project ID' });
      }
    }

    const task = await prisma.task.create({
      data: {
        title: title.trim(),
        description: description?.trim(),
        dueDate,
        priority: priority || 'MEDIUM',
        projectId,
        userId
      },
      include: {
        project: {
          select: { id: true, name: true, color: true }
        }
      }
    });

    res.status(201).json({ task, message: 'Task created successfully' });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ message: 'Server error while creating task' });
  }
});

// Update task
router.put('/:id', [
  authenticate,
  body('title').optional().notEmpty().trim().withMessage('Title cannot be empty'),
  body('description').optional().trim(),
  body('dueDate').optional().isISO8601().toDate(),
  body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH']),
  body('isComplete').optional().isBoolean(),
  body('projectId').optional().isUUID()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, description, dueDate, priority, isComplete, projectId } = req.body;
    const userId = req.user.id;

    // Check if task exists and belongs to user
    const existingTask = await prisma.task.findFirst({
      where: { id: req.params.id, userId }
    });

    if (!existingTask) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Verify project ownership if projectId is provided
    if (projectId) {
      const project = await prisma.project.findFirst({
        where: { id: projectId, userId }
      });

      if (!project) {
        return res.status(400).json({ message: 'Invalid project ID' });
      }
    }

    const updateData = {};
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description?.trim();
    if (dueDate !== undefined) updateData.dueDate = dueDate;
    if (priority !== undefined) updateData.priority = priority;
    if (isComplete !== undefined) updateData.isComplete = isComplete;
    if (projectId !== undefined) updateData.projectId = projectId;

    const task = await prisma.task.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        project: {
          select: { id: true, name: true, color: true }
        }
      }
    });

    res.json({ task, message: 'Task updated successfully' });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ message: 'Server error while updating task' });
  }
});

// Toggle task completion
router.patch('/:id/toggle', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const task = await prisma.task.findFirst({
      where: { id: req.params.id, userId }
    });

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const updatedTask = await prisma.task.update({
      where: { id: req.params.id },
      data: { isComplete: !task.isComplete },
      include: {
        project: {
          select: { id: true, name: true, color: true }
        }
      }
    });

    res.json({ 
      task: updatedTask, 
      message: `Task marked as ${updatedTask.isComplete ? 'complete' : 'incomplete'}` 
    });
  } catch (error) {
    console.error('Error toggling task:', error);
    res.status(500).json({ message: 'Server error while toggling task' });
  }
});

// Soft delete task
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const task = await prisma.task.findFirst({
      where: { id: req.params.id, userId }
    });

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    await prisma.task.update({
      where: { id: req.params.id },
      data: {
        isDeleted: true,
        deletedAt: new Date()
      }
    });

    res.json({ message: 'Task moved to trash' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ message: 'Server error while deleting task' });
  }
});

// Restore task from trash
router.patch('/:id/restore', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const task = await prisma.task.findFirst({
      where: { id: req.params.id, userId, isDeleted: true }
    });

    if (!task) {
      return res.status(404).json({ message: 'Task not found in trash' });
    }

    const restoredTask = await prisma.task.update({
      where: { id: req.params.id },
      data: {
        isDeleted: false,
        deletedAt: null
      },
      include: {
        project: {
          select: { id: true, name: true, color: true }
        }
      }
    });

    res.json({ task: restoredTask, message: 'Task restored successfully' });
  } catch (error) {
    console.error('Error restoring task:', error);
    res.status(500).json({ message: 'Server error while restoring task' });
  }
});

// Permanently delete task
router.delete('/:id/permanent', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const task = await prisma.task.findFirst({
      where: { id: req.params.id, userId, isDeleted: true }
    });

    if (!task) {
      return res.status(404).json({ message: 'Task not found in trash' });
    }

    await prisma.task.delete({
      where: { id: req.params.id }
    });

    res.json({ message: 'Task permanently deleted' });
  } catch (error) {
    console.error('Error permanently deleting task:', error);
    res.status(500).json({ message: 'Server error while permanently deleting task' });
  }
});

module.exports = router;