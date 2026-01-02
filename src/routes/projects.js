const express = require('express');
const { body, validationResult } = require('express-validator');
const passport = require('passport');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// Middleware to protect routes
const authenticate = passport.authenticate('jwt', { session: false });

// Get all projects for user
router.get('/', authenticate, async (req, res) => {
  try {
    const projects = await prisma.project.findMany({
      where: { userId: req.user.id },
      include: {
        _count: {
          select: { 
            tasks: { 
              where: { isDeleted: false } 
            } 
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ projects });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ message: 'Server error while fetching projects' });
  }
});

// Get single project
router.get('/:id', authenticate, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      },
      include: {
        tasks: {
          where: { isDeleted: false },
          orderBy: [
            { dueDate: 'asc' },
            { priority: 'desc' },
            { createdAt: 'desc' }
          ]
        }
      }
    });

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    res.json({ project });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ message: 'Server error while fetching project' });
  }
});

// Create new project
router.post('/', [
  authenticate,
  body('name').notEmpty().trim().withMessage('Project name is required'),
  body('color').optional().matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).withMessage('Invalid color format')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, color } = req.body;
    const userId = req.user.id;

    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        color: color || '#3B82F6', // Default blue
        userId
      },
      include: {
        _count: {
          select: { tasks: { where: { isDeleted: false } } }
        }
      }
    });

    res.status(201).json({ project, message: 'Project created successfully' });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ message: 'Server error while creating project' });
  }
});

// Update project
router.put('/:id', [
  authenticate,
  body('name').optional().notEmpty().trim().withMessage('Project name cannot be empty'),
  body('color').optional().matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).withMessage('Invalid color format')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, color } = req.body;
    const userId = req.user.id;

    // Check if project exists and belongs to user
    const existingProject = await prisma.project.findFirst({
      where: { id: req.params.id, userId }
    });

    if (!existingProject) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (color !== undefined) updateData.color = color;

    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        _count: {
          select: { tasks: { where: { isDeleted: false } } }
        }
      }
    });

    res.json({ project, message: 'Project updated successfully' });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ message: 'Server error while updating project' });
  }
});

// Delete project
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId }
    });

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // When a project is deleted, set projectId to null for all its tasks
    await prisma.$transaction([
      prisma.task.updateMany({
        where: { projectId: req.params.id },
        data: { projectId: null }
      }),
      prisma.project.delete({
        where: { id: req.params.id }
      })
    ]);

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ message: 'Server error while deleting project' });
  }
});

module.exports = router;