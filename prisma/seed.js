const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create demo user
  const hashedPassword = await bcrypt.hash('demo123', 12);
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@taskflow.com' },
    update: {},
    create: {
      email: 'demo@taskflow.com',
      password: hashedPassword,
      name: 'Demo User',
    },
  });

  // Create sample projects
  const workProject = await prisma.project.upsert({
    where: { 
      id: 'clx1234567890work'
    },
    update: {},
    create: {
      id: 'clx1234567890work',
      name: 'Work Projects',
      color: '#3B82F6',
      userId: demoUser.id,
    },
  });

  const personalProject = await prisma.project.upsert({
    where: { 
      id: 'clx1234567890personal'
    },
    update: {},
    create: {
      id: 'clx1234567890personal',
      name: 'Personal Tasks',
      color: '#10B981',
      userId: demoUser.id,
    },
  });

  // Create sample tasks
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  await prisma.task.upsert({
    where: { id: 'clx1234567890task1' },
    update: {},
    create: {
      id: 'clx1234567890task1',
      title: 'Review project proposal',
      description: 'Go through the Q4 project proposal and provide feedback',
      dueDate: today,
      priority: 'HIGH',
      userId: demoUser.id,
      projectId: workProject.id,
    },
  });

  await prisma.task.upsert({
    where: { id: 'clx1234567890task2' },
    update: {},
    create: {
      id: 'clx1234567890task2',
      title: 'Team meeting preparation',
      description: 'Prepare slides for weekly team meeting',
      dueDate: tomorrow,
      priority: 'MEDIUM',
      userId: demoUser.id,
      projectId: workProject.id,
    },
  });

  await prisma.task.upsert({
    where: { id: 'clx1234567890task3' },
    update: {},
    create: {
      id: 'clx1234567890task3',
      title: 'Buy groceries',
      description: 'Milk, eggs, bread, vegetables',
      dueDate: today,
      priority: 'LOW',
      userId: demoUser.id,
      projectId: personalProject.id,
    },
  });

  await prisma.task.upsert({
    where: { id: 'clx1234567890task4' },
    update: {},
    create: {
      id: 'clx1234567890task4',
      title: 'Book dentist appointment',
      description: 'Schedule routine checkup',
      dueDate: nextWeek,
      priority: 'MEDIUM',
      userId: demoUser.id,
      projectId: personalProject.id,
    },
  });

  await prisma.task.upsert({
    where: { id: 'clx1234567890task5' },
    update: {},
    create: {
      id: 'clx1234567890task5',
      title: 'Complete online course',
      description: 'Finish React advanced patterns module',
      dueDate: nextWeek,
      priority: 'HIGH',
      userId: demoUser.id,
      projectId: workProject.id,
      isComplete: true,
    },
  });

  console.log('✅ Database seeded successfully!');
  console.log('👤 Demo user: demo@taskflow.com / demo123');
  console.log('📋 Sample projects and tasks created');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });