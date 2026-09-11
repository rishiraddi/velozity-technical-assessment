import { Router } from 'express';
import { z } from 'zod';
import { Role, TaskStatus, Priority } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { canViewProject } from '../services/access.js';
import { emitProject, emitToUser } from '../lib/realtime.js';

export const projectRouter = Router();

projectRouter.use(requireAuth);

const projectIn = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(1000),
  clientId: z.string().min(1),
});

projectRouter.get('/', async (req, res, next) => {
  try {
    const u = req.user!;
    const where = u.role === Role.ADMIN ? {} : { creatorId: u.id };

    const p = await prisma.project.findMany({
      where,
      include: {
        client: true,
        _count: { select: { tasks: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ projects: p });
  } catch (e) {
    next(e);
  }
});

projectRouter.post(
  '/',
  requireRole(Role.ADMIN, Role.PM),
  async (req, res, next) => {
    try {
      const b = projectIn.parse(req.body);

      const c = await prisma.client.findUnique({
        where: { id: b.clientId },
      });

      if (!c) {
        return res.status(404).json({
          error: {
            code: 'CLIENT_NOT_FOUND',
            message: 'Client not found',
          },
        });
      }

      const p = await prisma.project.create({
        data: {
          ...b,
          creatorId: req.user!.id,
        },
      });

      await prisma.activity.create({
        data: {
          type: 'PROJECT_CREATED',
          message: `${p.name} was created`,
          projectId: p.id,
          userId: req.user!.id,
        },
      });

      res.status(201).json({ project: p });
    } catch (e) {
      next(e);
    }
  }
);

projectRouter.get('/:id', async (req, res, next) => {
  try {
    const projectId = req.params.id as string;

    if (
      !(await canViewProject(
        req.user!.id,
        req.user!.role,
        projectId
      ))
    ) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You cannot access this project',
        },
      });
    }

    const p = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        client: true,
        creator: {
          select: {
            id: true,
            name: true,
          },
        },
        tasks: {
          include: {
            developer: {
              select: {
                id: true,
                name: true,
              },
            },
            _count: {
              select: {
                activities: true,
              },
            },
          },
          orderBy: [
            { priority: 'desc' },
            { dueDate: 'asc' },
          ],
        },
      },
    });

    if (!p) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Project not found',
        },
      });
    }

    res.json({ project: p });
  } catch (e) {
    next(e);
  }
});

const taskIn = z.object({
  title: z.string().min(2).max(150),
  description: z.string().max(2000),
  developerId: z.string().min(1),
  status: z
    .nativeEnum(TaskStatus)
    .default(TaskStatus.TODO),
  priority: z
    .nativeEnum(Priority)
    .default(Priority.MEDIUM),
  dueDate: z.coerce.date(),
});

projectRouter.post(
  '/:id/tasks',
  requireRole(Role.ADMIN, Role.PM),
  async (req, res, next) => {
    try {
      const projectId = req.params.id as string;

      if (
        !(await canViewProject(
          req.user!.id,
          req.user!.role,
          projectId
        ))
      ) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'You cannot manage this project',
          },
        });
      }

      const b = taskIn.parse(req.body);

      const d = await prisma.user.findFirst({
        where: {
          id: b.developerId,
          role: Role.DEVELOPER,
        },
      });

      if (!d) {
        return res.status(400).json({
          error: {
            code: 'INVALID_DEVELOPER',
            message: 'Assigned user must be a developer',
          },
        });
      }

      const t = await prisma.task.create({
        data: {
          ...b,
          projectId,
        },
      });

      await prisma.$transaction([
        prisma.activity.create({
          data: {
            type: 'TASK_ASSIGNED',
            message: `${d.name} was assigned Task #${t.id}`,
            projectId: t.projectId,
            taskId: t.id,
            userId: req.user!.id,
          },
        }),

        prisma.notification.create({
          data: {
            userId: d.id,
            title: 'New task assigned',
            message: `You were assigned Task #${t.id}: ${t.title}`,
          },
        }),
      ]);

      emitProject(t.projectId, 'activity:new', {
        activity: {
          type: 'TASK_ASSIGNED',
          message: `${d.name} was assigned Task #${t.id}`,
          taskId: t.id,
          projectId: t.projectId,
          userId: req.user!.id,
        },
      });

      emitToUser(d.id, 'notification:new', {
        message: `You were assigned Task #${t.id}`,
      });

      res.status(201).json({ task: t });
    } catch (e) {
      next(e);
    }
  }
);

projectRouter.patch(
  '/:id',
  requireRole(Role.ADMIN, Role.PM),
  async (req, res, next) => {
    try {
      const projectId = req.params.id as string;

      if (
        !(await canViewProject(
          req.user!.id,
          req.user!.role,
          projectId
        ))
      ) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'You cannot manage this project',
          },
        });
      }

      const b = projectIn.partial().parse(req.body);

      const p = await prisma.project.update({
        where: { id: projectId },
        data: b,
      });

      res.json({ project: p });
    } catch (e) {
      next(e);
    }
  }
);

projectRouter.delete(
  '/:id',
  requireRole(Role.ADMIN, Role.PM),
  async (req, res, next) => {
    try {
      const projectId = req.params.id as string;

      if (
        !(await canViewProject(
          req.user!.id,
          req.user!.role,
          projectId
        ))
      ) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'You cannot manage this project',
          },
        });
      }

      await prisma.project.delete({
        where: { id: projectId },
      });

      res.status(204).end();
    } catch (e) {
      next(e);
    }
  }
);

export default projectRouter;