import { Body, CanActivate, Controller, ExecutionContext, Get, Injectable, Module, Post, Req, UnauthorizedException, UseGuards, Param, Patch, Delete, ForbiddenException, NotFoundException, Query, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { PrismaClient } from '../../../packages/db/generated/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import * as nodemailer from 'nodemailer';

const db = new PrismaClient();
class RegisterDto { @IsString() @MinLength(2) name!: string; @IsEmail() email!: string; @IsString() @MinLength(12) password!: string; @IsString() @MinLength(2) organization!: string; }
class RegisterInviteDto { @IsString() @MinLength(2) name!: string; @IsEmail() email!: string; @IsString() @MinLength(12) password!: string; @IsString() @MinLength(20) invitationToken!: string; }
class LoginDto { @IsEmail() email!: string; @IsString() password!: string; }
class ProjectDto { @IsString() @MinLength(2) name!: string; @IsOptional() @IsString() description?: string; }
class TaskDto { @IsOptional() @IsString() @MinLength(2) title?: string; @IsOptional() @IsString() description?: string; @IsOptional() @IsIn(['TODO','IN_PROGRESS','DONE']) status?: string; @IsOptional() @IsIn(['LOW','MEDIUM','HIGH','URGENT']) priority?: string; @IsOptional() @IsDateString() dueAt?: string; @IsOptional() @IsString() assigneeId?: string | null; }
class CommentDto { @IsString() @MinLength(1) body!: string; }
class InviteDto { @IsEmail() email!: string; @IsIn(['MANAGER','DEVELOPER']) role!: string; }
class RoleDto { @IsIn(['MANAGER','DEVELOPER']) role!: string; }

@Injectable()
class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest(); const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    try { req.user = await this.jwt.verifyAsync(token); return true; } catch { throw new UnauthorizedException('Authentication required'); }
  }
}
@Injectable()
class MailerService {
  private transport = process.env.SMTP_HOST ? nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || '' } : undefined }) : null;
  async sendInvitation(to: string, organizationName: string, token: string, role: string): Promise<boolean> {
    if (!this.transport) { if (process.env.NODE_ENV === 'production') throw new ServiceUnavailableException('SMTP is required to send invitations in production.'); return false; }
    const appUrl = (process.env.APP_URL || process.env.WEB_ORIGIN || 'http://localhost:3000').replace(/\/$/, '');
    const link = `${appUrl}/?invite=${encodeURIComponent(token)}`;
    const safeOrg = organizationName.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
    try {
      await this.transport.sendMail({ from: process.env.MAIL_FROM || 'DevTask Enterprise <no-reply@localhost>', to, subject: `Invitation to join ${organizationName} on DevTask`, text: `You were invited to join ${organizationName} as ${role}. Create an account or sign in to accept: ${link}\nThis one-time invitation expires in 7 days.`, html: `<p>You were invited to join <strong>${safeOrg}</strong> as ${role}.</p><p><a href="${link}">Accept invitation</a></p><p>This one-time invitation expires in 7 days.</p>` });
      return true;
    } catch { throw new ServiceUnavailableException('Invitation email could not be delivered. Check SMTP configuration and try again.'); }
  }
}
@ApiTags('identity') @Controller('auth')
class AuthController {
  constructor(private jwt: JwtService) {}
  @Get('organizations') @UseGuards(AuthGuard) async organizations(@Req() req: any) { return db.membership.findMany({ where: { userId: req.user.sub }, include: { organization: { select: { id: true, name: true, slug: true } } }, orderBy: { organization: { name: 'asc' } } }); }
  @Post('register') async register(@Body() dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    if (await db.user.findUnique({ where: { email } })) throw new ForbiddenException('Unable to create account with these details');
    const slug = `${dto.organization.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}-${Math.random().toString(36).slice(2,7)}`;
    const user = await db.$transaction(async (tx: any) => {
      const u = await tx.user.create({ data: { name: dto.name.trim(), email, passwordHash: await bcrypt.hash(dto.password, 12) } });
      const org = await tx.organization.create({ data: { name: dto.organization.trim(), slug } });
      await tx.membership.create({ data: { userId: u.id, organizationId: org.id, role: 'OWNER' } });
      await tx.project.create({ data: { organizationId: org.id, name: 'Getting started', description: 'Your first project. Add tasks and invite your team.' } });
      return { ...u, organizationId: org.id, role: 'OWNER' };
    });
    return this.session(user);
  }
  @Post('register/accept-invitation') async registerFromInvitation(@Body() dto: RegisterInviteDto) {
    const email = dto.email.trim().toLowerCase(); if (await db.user.findUnique({ where: { email } })) throw new BadRequestException('Account already exists; sign in and accept the invitation');
    const tokenHash = createHash('sha256').update(dto.invitationToken).digest('hex'); const invitation = await db.invitation.findUnique({ where: { tokenHash } });
    if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date() || invitation.email !== email) throw new BadRequestException('Invitation is invalid, expired, or addressed to another email');
    const user = await db.$transaction(async (tx: any) => {
      const created = await tx.user.create({ data: { name: dto.name.trim(), email, passwordHash: await bcrypt.hash(dto.password, 12) } });
      await tx.membership.create({ data: { userId: created.id, organizationId: invitation.organizationId, role: invitation.role } });
      await tx.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } });
      return { ...created, organizationId: invitation.organizationId, role: invitation.role };
    });
    return this.session(user);
  }
  @Post('login') async login(@Body() dto: LoginDto) {
    const u = await db.user.findUnique({ where: { email: dto.email.trim().toLowerCase() }, include: { memberships: true } });
    if (!u || !(await bcrypt.compare(dto.password, u.passwordHash))) throw new UnauthorizedException('Invalid email or password');
    const membership = u.memberships[0]; if (!membership) throw new UnauthorizedException('Invalid email or password');
    return this.session({ ...u, organizationId: membership.organizationId, role: membership.role });
  }
  @Post('switch/:organizationId') @UseGuards(AuthGuard) async switchOrganization(@Param('organizationId') organizationId: string, @Req() req: any) {
    const membership = await db.membership.findUnique({ where: { userId_organizationId: { userId: req.user.sub, organizationId } } });
    if (!membership) throw new ForbiddenException('Organization membership required');
    const user = await db.user.findUniqueOrThrow({ where: { id: req.user.sub } });
    return this.session({ ...user, organizationId, role: membership.role });
  }
  private session(u: any) { return { accessToken: this.jwt.sign({ sub: u.id, email: u.email, name: u.name, organizationId: u.organizationId, role: u.role }), user: { id: u.id, name: u.name, email: u.email, organizationId: u.organizationId, role: u.role } }; }
}

@ApiTags('projects') @ApiBearerAuth() @UseGuards(AuthGuard) @Controller('projects')
class ProjectsController {
  @Get() async list(@Req() req: any, @Query('q') q = '', @Query('page') page = '1', @Query('limit') limit = '20') {
    const take = Math.max(1, Math.min(100, Number(limit) || 20)); const skip = (Math.max(1, Number(page) || 1) - 1) * take;
    const where = { organizationId: req.user.organizationId, ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}) };
    const [data, total] = await Promise.all([db.project.findMany({ where, include: { _count: { select: { tasks: true } } }, orderBy: { createdAt: 'desc' }, skip, take }), db.project.count({ where })]);
    return { data, page: Math.floor(skip / take) + 1, limit: take, total, totalPages: Math.ceil(total / take) };
  }
  @Post() async create(@Body() dto: ProjectDto, @Req() req: any) {
    this.assertManager(req.user.role); const p = await db.project.create({ data: { organizationId: req.user.organizationId, name: dto.name.trim(), description: dto.description || '' } });
    await db.auditEvent.create({ data: { organizationId: req.user.organizationId, actorId: req.user.sub, action: 'PROJECT_CREATED', entityType: 'Project', entityId: p.id } }); return p;
  }
  @Patch(':id') async update(@Param('id') id: string, @Body() dto: ProjectDto, @Req() req: any) {
    this.assertManager(req.user.role); await this.findProject(id, req.user.organizationId);
    return db.project.update({ where: { id }, data: { ...(dto.name ? { name: dto.name.trim() } : {}), ...(dto.description !== undefined ? { description: dto.description } : {}) } });
  }
  @Delete(':id') async remove(@Param('id') id: string, @Req() req: any) { this.assertManager(req.user.role); await this.findProject(id, req.user.organizationId); await db.project.delete({ where: { id } }); return { ok: true }; }
  private async findProject(id: string, organizationId: string) { const p = await db.project.findFirst({ where: { id, organizationId } }); if (!p) throw new NotFoundException('Project not found'); return p; }
  private assertManager(role: string) { if (!['OWNER','MANAGER'].includes(role)) throw new ForbiddenException('Insufficient permission'); }
}

@ApiTags('tasks') @ApiBearerAuth() @UseGuards(AuthGuard) @Controller('projects/:projectId/tasks')
class TasksController {
  @Get() async list(@Param('projectId') projectId: string, @Req() req: any, @Query('q') q = '', @Query('status') status = '', @Query('page') page = '1', @Query('limit') limit = '50') { await this.project(projectId, req.user.organizationId); const take = Math.max(1, Math.min(100, Number(limit) || 50)); const skip = (Math.max(1, Number(page) || 1) - 1) * take; const where: any = { projectId, ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}), ...(status && ['TODO','IN_PROGRESS','DONE'].includes(status) ? { status } : {}) }; const [data,total] = await Promise.all([db.task.findMany({ where, include: { assignee: { select: { id: true, name: true } }, comments: { include: { author: { select: { name: true } } }, orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'desc' }, skip, take }), db.task.count({ where })]); return { data, page: Math.floor(skip / take) + 1, limit: take, total, totalPages: Math.ceil(total / take) }; }
  @Post() async create(@Param('projectId') projectId: string, @Body() dto: TaskDto, @Req() req: any) { await this.project(projectId, req.user.organizationId); if (req.user.role === 'DEVELOPER') throw new ForbiddenException('Insufficient permission'); if (!dto.title?.trim()) throw new BadRequestException('Task title is required'); const created = await db.task.create({ data: { projectId, title: dto.title.trim(), description: dto.description || '', status: dto.status || 'TODO', priority: dto.priority || 'MEDIUM', dueAt: dto.dueAt ? new Date(dto.dueAt) : null, ...(dto.assigneeId ? { assigneeId: await this.assignee(dto.assigneeId, req.user.organizationId) } : {}) } }); await db.auditEvent.create({ data: { organizationId: req.user.organizationId, actorId: req.user.sub, action: 'TASK_CREATED', entityType: 'Task', entityId: created.id } }); return created; }
  @Patch(':id') async update(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: TaskDto, @Req() req: any) {
    await this.project(projectId, req.user.organizationId); const task = await db.task.findFirst({ where: { id, projectId } }); if (!task) throw new NotFoundException('Task not found');
    if (req.user.role === 'DEVELOPER' && (!['TODO','IN_PROGRESS','DONE'].includes(dto.status || '') || dto.priority !== undefined || dto.assigneeId !== undefined || dto.dueAt !== undefined || dto.title !== undefined || dto.description !== undefined)) throw new ForbiddenException('Developers may only update task status');
    if (req.user.role === 'DEVELOPER' && task.assigneeId !== req.user.sub) throw new ForbiddenException('Developers may only update their assigned tasks');
    const updated = await db.task.update({ where: { id }, data: { ...(dto.title ? { title: dto.title.trim() } : {}), ...(dto.description !== undefined ? { description: dto.description } : {}), ...(dto.status ? { status: dto.status } : {}), ...(dto.priority ? { priority: dto.priority } : {}), ...(dto.dueAt !== undefined ? { dueAt: dto.dueAt ? new Date(dto.dueAt) : null } : {}), ...(dto.assigneeId !== undefined ? { assigneeId: dto.assigneeId ? await this.assignee(dto.assigneeId, req.user.organizationId) : null } : {}) } }); await db.auditEvent.create({ data: { organizationId: req.user.organizationId, actorId: req.user.sub, action: 'TASK_UPDATED', entityType: 'Task', entityId: id } }); return updated;
  }
  @Delete(':id') async remove(@Param('projectId') projectId: string, @Param('id') id: string, @Req() req: any) { await this.project(projectId, req.user.organizationId); if (req.user.role === 'DEVELOPER') throw new ForbiddenException('Insufficient permission'); const t = await db.task.findFirst({ where: { id, projectId } }); if (!t) throw new NotFoundException('Task not found'); await db.task.delete({ where: { id } }); return { ok: true }; }
  private async project(id: string, organizationId: string) { const p = await db.project.findFirst({ where: { id, organizationId } }); if (!p) throw new NotFoundException('Project not found'); return p; }
  private async assignee(userId: string, organizationId: string) { const m = await db.membership.findUnique({ where: { userId_organizationId: { userId, organizationId } } }); if (!m) throw new BadRequestException('Assignee must be a member of this organization'); return userId; }
}

@ApiTags('comments') @ApiBearerAuth() @UseGuards(AuthGuard) @Controller('projects/:projectId/tasks/:taskId/comments')
class CommentsController {
  @Get() async list(@Param('projectId') projectId: string, @Param('taskId') taskId: string, @Req() req: any) { await this.task(projectId, taskId, req.user.organizationId); return db.comment.findMany({ where: { taskId }, include: { author: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } }); }
  @Post() async create(@Param('projectId') projectId: string, @Param('taskId') taskId: string, @Body() dto: CommentDto, @Req() req: any) { await this.task(projectId, taskId, req.user.organizationId); return db.comment.create({ data: { taskId, authorId: req.user.sub, body: dto.body.trim() }, include: { author: { select: { id: true, name: true } } } }); }
  private async task(projectId: string, taskId: string, organizationId: string) { const task = await db.task.findFirst({ where: { id: taskId, projectId, project: { organizationId } } }); if (!task) throw new NotFoundException('Task not found'); return task; }
}

@ApiTags('organization') @ApiBearerAuth() @UseGuards(AuthGuard) @Controller('organization')
class OrganizationController {
  constructor(private mailer: MailerService) {}
  @Get() async current(@Req() req: any) { return db.organization.findUniqueOrThrow({ where: { id: req.user.organizationId }, select: { id: true, name: true, slug: true, createdAt: true } }); }
  @Get('members') async members(@Req() req: any) { return db.membership.findMany({ where: { organizationId: req.user.organizationId }, include: { user: { select: { id: true, name: true, email: true, createdAt: true } } }, orderBy: { user: { name: 'asc' } } }); }
  @Post('invitations') async invite(@Body() dto: InviteDto, @Req() req: any) {
    this.requireOwner(req.user.role); const email = dto.email.trim().toLowerCase();
    const existing = await db.membership.findFirst({ where: { organizationId: req.user.organizationId, user: { email } } }); if (existing) throw new BadRequestException('This person is already a member');
    const token = randomBytes(32).toString('base64url'); const tokenHash = createHash('sha256').update(token).digest('hex');
    const invitation = await db.invitation.create({ data: { organizationId: req.user.organizationId, email, role: dto.role, tokenHash, expiresAt: new Date(Date.now() + 7 * 86400000) } });
    const org = await db.organization.findUniqueOrThrow({ where: { id: req.user.organizationId }, select: { name: true } });
    let emailSent: boolean;
    try { emailSent = await this.mailer.sendInvitation(email, org.name, token, dto.role); }
    catch (error) { await db.invitation.delete({ where: { id: invitation.id } }); throw error; }
    await db.auditEvent.create({ data: { organizationId: req.user.organizationId, actorId: req.user.sub, action: 'MEMBER_INVITED', entityType: 'Invitation', entityId: invitation.id } });
    // Local development can copy the token once when SMTP is not configured. Never log it.
    return { id: invitation.id, email, role: dto.role, expiresAt: invitation.expiresAt, emailSent, ...(emailSent ? {} : { invitationToken: token }) };
  }
  @Post('invitations/accept') async accept(@Body() body: { token: string }, @Req() req: any) {
    if (!body?.token || typeof body.token !== 'string') throw new BadRequestException('Invitation token is required');
    const tokenHash = createHash('sha256').update(body.token).digest('hex'); const invitation = await db.invitation.findUnique({ where: { tokenHash } });
    if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) throw new BadRequestException('Invitation is invalid or expired');
    const user = await db.user.findUniqueOrThrow({ where: { id: req.user.sub } }); if (user.email.toLowerCase() !== invitation.email) throw new ForbiddenException('Invitation was sent to a different address');
    await db.$transaction([db.membership.create({ data: { userId: user.id, organizationId: invitation.organizationId, role: invitation.role } }), db.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } })]);
    return { ok: true, organizationId: invitation.organizationId, role: invitation.role };
  }
  @Patch('members/:userId') async changeRole(@Param('userId') userId: string, @Body() dto: RoleDto, @Req() req: any) { this.requireOwner(req.user.role); const member = await db.membership.findFirst({ where: { userId, organizationId: req.user.organizationId } }); if (!member) throw new NotFoundException('Member not found'); if (member.role === 'OWNER') throw new BadRequestException('Owner role cannot be changed here'); return db.membership.update({ where: { id: member.id }, data: { role: dto.role } }); }
  @Delete('members/:userId') async removeMember(@Param('userId') userId: string, @Req() req: any) { this.requireOwner(req.user.role); const member = await db.membership.findFirst({ where: { userId, organizationId: req.user.organizationId } }); if (!member) throw new NotFoundException('Member not found'); if (member.role === 'OWNER') throw new BadRequestException('Owner membership cannot be removed'); await db.membership.delete({ where: { id: member.id } }); return { ok: true }; }
  @Get('audit') async audit(@Req() req: any, @Query('page') page = '1', @Query('limit') limit = '50') { if (!['OWNER','MANAGER'].includes(req.user.role)) throw new ForbiddenException('Insufficient permission'); const take = Math.max(1, Math.min(100, Number(limit) || 50)); return db.auditEvent.findMany({ where: { organizationId: req.user.organizationId }, orderBy: { createdAt: 'desc' }, skip: (Math.max(1, Number(page) || 1) - 1) * take, take }); }
  private requireOwner(role: string) { if (role !== 'OWNER') throw new ForbiddenException('Owner permission required'); }
}

@Controller('health') class HealthController { @Get() health() { return { status: 'ok', service: 'devtask-api' }; } }
@Module({ imports: [JwtModule.register({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '8h' } })], controllers: [AuthController, ProjectsController, TasksController, CommentsController, OrganizationController, HealthController], providers: [AuthGuard, MailerService] })
export class AppModule {}
