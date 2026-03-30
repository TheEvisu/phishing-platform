import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TemplatesService } from './templates.service';
import { Template } from '../schemas/template.schema';

const ORG_ID = new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');

const adminUser = { username: 'admin', role: 'org_admin', organizationId: ORG_ID };
const memberUser = { username: 'alice', role: 'member',   organizationId: ORG_ID };
const otherUser  = { username: 'bob',   role: 'member',   organizationId: ORG_ID };

const mockTemplate = {
  _id: 'tpl-id-1',
  name: 'Password Expiry Warning',
  category: 'IT',
  subject: 'Reset your password',
  content: 'Click {{TRACKING_LINK}}',
  createdBy: 'alice',
  organizationId: ORG_ID,
};

// ─── Model mocks ─────────────────────────────────────────────────────────────

const mockTemplateModel = {
  find: jest.fn(),
  findOne: jest.fn(),
  findByIdAndDelete: jest.fn(),
};

function MockTemplateModelConstructor(dto: any) {
  return { ...mockTemplate, ...dto, save: jest.fn().mockResolvedValue(undefined) };
}
Object.assign(MockTemplateModelConstructor, mockTemplateModel);

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('TemplatesService', () => {
  let service: TemplatesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplatesService,
        { provide: getModelToken(Template.name), useValue: MockTemplateModelConstructor },
      ],
    }).compile();

    service = module.get<TemplatesService>(TemplatesService);
    jest.clearAllMocks();
  });

  // ─── getAll ───────────────────────────────────────────────────────────────

  describe('getAll', () => {
    it('admin query omits createdBy filter', async () => {
      const exec = jest.fn().mockResolvedValue([mockTemplate]);
      mockTemplateModel.find.mockReturnValue({ sort: () => ({ exec }) });

      await service.getAll(adminUser);

      expect(mockTemplateModel.find).toHaveBeenCalledWith(
        expect.not.objectContaining({ createdBy: expect.anything() }),
      );
      expect(mockTemplateModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: ORG_ID }),
      );
    });

    it('member query includes createdBy filter', async () => {
      const exec = jest.fn().mockResolvedValue([mockTemplate]);
      mockTemplateModel.find.mockReturnValue({ sort: () => ({ exec }) });

      await service.getAll(memberUser);

      expect(mockTemplateModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: ORG_ID, createdBy: 'alice' }),
      );
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('saves template with user context', async () => {
      const dto = { name: 'New Tpl', category: 'IT', subject: 'Subj', content: 'Body' };

      const result = await service.create(dto, memberUser);

      expect(result).toMatchObject({ createdBy: 'alice', organizationId: ORG_ID });
    });
  });

  // ─── getById ──────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('returns template for admin regardless of createdBy', async () => {
      mockTemplateModel.findOne.mockResolvedValue(mockTemplate);

      const result = await service.getById('tpl-id-1', adminUser);

      expect(result).toEqual(mockTemplate);
    });

    it('returns template for the member who created it', async () => {
      mockTemplateModel.findOne.mockResolvedValue(mockTemplate);

      const result = await service.getById('tpl-id-1', memberUser);

      expect(result).toEqual(mockTemplate);
    });

    it('throws NotFoundException when template not in org', async () => {
      mockTemplateModel.findOne.mockResolvedValue(null);

      await expect(service.getById('nonexistent', memberUser)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when member tries to access another member template', async () => {
      mockTemplateModel.findOne.mockResolvedValue(mockTemplate); // createdBy: 'alice'

      await expect(service.getById('tpl-id-1', otherUser)).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates own template as member', async () => {
      const saveMock = jest.fn().mockResolvedValue(undefined);
      const doc = { ...mockTemplate, save: saveMock };
      mockTemplateModel.findOne.mockResolvedValue(doc);

      const result = await service.update('tpl-id-1', { subject: 'New Subject' }, memberUser);

      expect(saveMock).toHaveBeenCalled();
      expect(result.subject).toBe('New Subject');
    });

    it('allows admin to update any org template', async () => {
      const saveMock = jest.fn().mockResolvedValue(undefined);
      const doc = { ...mockTemplate, save: saveMock };
      mockTemplateModel.findOne.mockResolvedValue(doc);

      const result = await service.update('tpl-id-1', { name: 'Renamed' }, adminUser);

      expect(saveMock).toHaveBeenCalled();
      expect(result.name).toBe('Renamed');
    });

    it('throws NotFoundException when template not in org', async () => {
      mockTemplateModel.findOne.mockResolvedValue(null);

      await expect(service.update('nonexistent', { name: 'X' }, memberUser)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when member tries to update another member template', async () => {
      mockTemplateModel.findOne.mockResolvedValue({ ...mockTemplate }); // createdBy: 'alice'

      await expect(service.update('tpl-id-1', { name: 'X' }, otherUser)).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── delete ───────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes template as admin', async () => {
      mockTemplateModel.findOne.mockResolvedValue(mockTemplate);
      mockTemplateModel.findByIdAndDelete.mockResolvedValue(mockTemplate);

      const result = await service.delete('tpl-id-1', adminUser);

      expect(mockTemplateModel.findByIdAndDelete).toHaveBeenCalledWith('tpl-id-1');
      expect(result).toEqual({ message: 'Template deleted successfully' });
    });

    it('deletes own template as member', async () => {
      mockTemplateModel.findOne.mockResolvedValue(mockTemplate);
      mockTemplateModel.findByIdAndDelete.mockResolvedValue(mockTemplate);

      const result = await service.delete('tpl-id-1', memberUser);

      expect(result).toEqual({ message: 'Template deleted successfully' });
    });

    it('throws NotFoundException when not found', async () => {
      mockTemplateModel.findOne.mockResolvedValue(null);

      await expect(service.delete('nonexistent', memberUser)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when member tries to delete another member template', async () => {
      mockTemplateModel.findOne.mockResolvedValue(mockTemplate); // createdBy: 'alice'

      await expect(service.delete('tpl-id-1', otherUser)).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── seedDefaults ─────────────────────────────────────────────────────────

  describe('seedDefaults', () => {
    it('creates all 6 default templates when none exist', async () => {
      const leanExec = jest.fn().mockResolvedValue([]);
      mockTemplateModel.find.mockReturnValue({ select: () => ({ lean: () => ({ exec: leanExec }) }) });

      const result = await service.seedDefaults(adminUser);

      expect(result.created).toBe(6);
      expect(result.templates).toHaveLength(6);
    });

    it('skips templates that already exist by name', async () => {
      const existing = [
        { name: 'Password Expiry Warning' },
        { name: 'Unusual Sign-In Alert' },
      ];
      const leanExec = jest.fn().mockResolvedValue(existing);
      mockTemplateModel.find.mockReturnValue({ select: () => ({ lean: () => ({ exec: leanExec }) }) });

      const result = await service.seedDefaults(adminUser);

      expect(result.created).toBe(4); // 6 defaults - 2 existing
    });

    it('creates 0 templates when all defaults already exist', async () => {
      const existing = [
        { name: 'Password Expiry Warning' },
        { name: 'Unusual Sign-In Alert' },
        { name: 'Employee Handbook Signature' },
        { name: 'Invoice Approval Required' },
        { name: 'Mandatory Security Patch' },
        { name: 'CEO Confidential Message' },
      ];
      const leanExec = jest.fn().mockResolvedValue(existing);
      mockTemplateModel.find.mockReturnValue({ select: () => ({ lean: () => ({ exec: leanExec }) }) });

      const result = await service.seedDefaults(adminUser);

      expect(result.created).toBe(0);
      expect(result.templates).toHaveLength(0);
    });
  });
});
