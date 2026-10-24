import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AttendeeInput } from '../../types';
import { api } from '../../lib/api';
import {
  IconPlus,
  IconTrash,
  IconUser,
  IconUsers,
  IconAlertCircle,
  IconArrowRight,
  IconShield,
  IconTag,
} from '../../lib/icons';

export interface SoloEntry {
  id: string;
  type: 'SOLO';
  attendee: AttendeeInput;
}

export interface TeamEntry {
  id: string;
  type: 'TEAM';
  teamName: string;
  member1: AttendeeInput;
  member2: AttendeeInput;
}

export type RegistrationEntry = SoloEntry | TeamEntry;

interface Step1AttendeesProps {
  attendees: AttendeeInput[];
  pricePerPerson: number;
  onUpdateAttendees: (newAttendees: AttendeeInput[]) => void;
  onNext: () => void;
}

interface AttendeeErrors {
  name?: string;
  email?: string;
  phone?: string;
}

// Convert internal entries structure to flat AttendeeInput array
function entriesToAttendees(entries: RegistrationEntry[]): AttendeeInput[] {
  const result: AttendeeInput[] = [];
  for (const entry of entries) {
    if (entry.type === 'SOLO') {
      result.push({
        ...entry.attendee,
        category: 'SOLO',
        team_name: undefined,
        team_id: undefined,
      });
    } else {
      result.push({
        ...entry.member1,
        category: 'TEAM',
        team_name: entry.teamName.trim(),
        team_id: entry.id,
      });
      result.push({
        ...entry.member2,
        category: 'TEAM',
        team_name: entry.teamName.trim(),
        team_id: entry.id,
      });
    }
  }
  return result;
}

// Convert flat AttendeeInput array to internal entries structure
function attendeesToEntries(attendees: AttendeeInput[]): RegistrationEntry[] {
  if (!attendees || attendees.length === 0) {
    return [
      {
        id: `entry-${Date.now()}`,
        type: 'SOLO',
        attendee: {
          id: `att-1`,
          name: '',
          email: '',
          phone: '',
          category: 'SOLO',
        },
      },
    ];
  }

  const entries: RegistrationEntry[] = [];
  const processedTeamIds = new Set<string>();

  for (let i = 0; i < attendees.length; i++) {
    const att = attendees[i];

    if (att.category === 'TEAM') {
      const teamId = att.team_id || `legacy-team-${i}`;
      if (processedTeamIds.has(teamId)) continue;
      processedTeamIds.add(teamId);

      // Find partner member
      const partner = attendees.find(
        (a, idx) => idx > i && (att.team_id ? a.team_id === att.team_id : a.category === 'TEAM')
      );

      if (partner) {
        entries.push({
          id: teamId,
          type: 'TEAM',
          teamName: att.team_name || partner.team_name || '',
          member1: att,
          member2: partner,
        });
      } else {
        entries.push({
          id: teamId,
          type: 'TEAM',
          teamName: att.team_name || '',
          member1: att,
          member2: {
            id: `att-${Date.now()}-partner`,
            name: '',
            email: '',
            phone: '',
            category: 'TEAM',
            team_id: teamId,
            team_name: att.team_name || '',
          },
        });
      }
    } else {
      entries.push({
        id: `entry-${att.id}`,
        type: 'SOLO',
        attendee: att,
      });
    }
  }

  return entries.length > 0
    ? entries
    : [
        {
          id: `entry-${Date.now()}`,
          type: 'SOLO',
          attendee: {
            id: `att-1`,
            name: '',
            email: '',
            phone: '',
            category: 'SOLO',
          },
        },
      ];
}

export const Step1Attendees: React.FC<Step1AttendeesProps> = ({
  attendees,
  pricePerPerson,
  onUpdateAttendees,
  onNext,
}) => {
  const [entries, setEntries] = useState<RegistrationEntry[]>(() =>
    attendeesToEntries(attendees)
  );

  const [validationError, setValidationError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [honeypot, setHoneypot] = useState<string>('');

  // Field-level error tracking and touched state
  const [fieldErrors, setFieldErrors] = useState<Record<string, AttendeeErrors>>({});
  const [teamErrors, setTeamErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, Record<string, boolean>>>({});

  // Sync entries whenever external attendees change significantly
  useEffect(() => {
    const currentFlattended = entriesToAttendees(entries);
    if (JSON.stringify(currentFlattended) !== JSON.stringify(attendees)) {
      onUpdateAttendees(currentFlattended);
    }
  }, [entries]);

  // Single field validation rule
  const validateField = (_id: string, field: keyof AttendeeErrors, value: string): string | undefined => {
    const val = value.trim();
    if (field === 'name') {
      if (!val) return 'Full name is required.';
      if (val.length < 2) return 'Name must be at least 2 characters.';
      if (val.length > 100) return 'Name must be under 100 characters.';
      if (!/^[\p{L}\s.'-]+$/u.test(val)) return 'Name contains invalid characters.';
    }
    if (field === 'email') {
      if (!val) return 'Email address is required.';
      const emailRegex =
        /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
      if (!emailRegex.test(val)) return 'Please enter a valid email address.';
    }
    if (field === 'phone') {
      const clean = value.replace(/\D/g, '').slice(-10);
      if (clean.length !== 10) return 'Please enter a valid 10-digit mobile number.';
      if (!/^[6-9]\d{9}$/.test(clean)) return 'Mobile number must start with 6, 7, 8, or 9.';
    }
    return undefined;
  };

  const validateTeamName = (name: string): string | undefined => {
    const val = name.trim();
    if (!val) return 'Team name is required.';
    if (val.length < 2) return 'Team name must be at least 2 characters.';
    if (val.length > 60) return 'Team name must be under 60 characters.';
    return undefined;
  };

  const handleBlur = (id: string, field: keyof AttendeeErrors, value: string) => {
    setTouched((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [field]: true },
    }));

    const error = validateField(id, field, value);
    setFieldErrors((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [field]: error },
    }));
  };

  const handleTeamBlur = (entryId: string, value: string) => {
    setTouched((prev) => ({
      ...prev,
      [entryId]: { ...(prev[entryId] || {}), teamName: true },
    }));

    const error = validateTeamName(value);
    setTeamErrors((prev) => ({
      ...prev,
      [entryId]: error || '',
    }));
  };

  // Solo Attendee field change
  const handleUpdateSoloField = (entryId: string, field: keyof AttendeeInput, value: string) => {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId || entry.type !== 'SOLO') return entry;
        return {
          ...entry,
          attendee: { ...entry.attendee, [field]: value },
        };
      })
    );

    const attId = entries.find((e) => e.id === entryId)?.type === 'SOLO'
      ? (entries.find((e) => e.id === entryId) as SoloEntry).attendee.id
      : '';

    if (attId && touched[attId]?.[field as keyof AttendeeErrors]) {
      const err = validateField(attId, field as keyof AttendeeErrors, value);
      setFieldErrors((prev) => ({
        ...prev,
        [attId]: { ...(prev[attId] || {}), [field]: err },
      }));
    }
  };

  // Team Attendee field change
  const handleUpdateTeamMemberField = (
    entryId: string,
    memberKey: 'member1' | 'member2',
    field: keyof AttendeeInput,
    value: string
  ) => {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId || entry.type !== 'TEAM') return entry;
        return {
          ...entry,
          [memberKey]: { ...entry[memberKey], [field]: value },
        };
      })
    );

    const targetEntry = entries.find((e) => e.id === entryId);
    if (targetEntry && targetEntry.type === 'TEAM') {
      const memberId = targetEntry[memberKey].id;
      if (touched[memberId]?.[field as keyof AttendeeErrors]) {
        const err = validateField(memberId, field as keyof AttendeeErrors, value);
        setFieldErrors((prev) => ({
          ...prev,
          [memberId]: { ...(prev[memberId] || {}), [field]: err },
        }));
      }
    }
  };

  // Team Name change
  const handleUpdateTeamName = (entryId: string, teamName: string) => {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId || entry.type !== 'TEAM') return entry;
        return {
          ...entry,
          teamName,
          member1: { ...entry.member1, team_name: teamName },
          member2: { ...entry.member2, team_name: teamName },
        };
      })
    );

    if (touched[entryId]?.teamName) {
      const err = validateTeamName(teamName);
      setTeamErrors((prev) => ({
        ...prev,
        [entryId]: err || '',
      }));
    }
  };

  // Switch entry type between Solo and Team
  const handleSwitchType = (entryId: string, newType: 'SOLO' | 'TEAM') => {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId) return entry;
        if (entry.type === newType) return entry;

        if (newType === 'TEAM' && entry.type === 'SOLO') {
          // Convert Solo to Team
          const primary = entry.attendee;
          return {
            id: entry.id,
            type: 'TEAM',
            teamName: '',
            member1: {
              ...primary,
              category: 'TEAM',
              team_id: entry.id,
              team_name: '',
            },
            member2: {
              id: `att-${Date.now()}-m2`,
              name: '',
              email: '',
              phone: '',
              category: 'TEAM',
              team_id: entry.id,
              team_name: '',
            },
          };
        } else if (newType === 'SOLO' && entry.type === 'TEAM') {
          // Convert Team to Solo (keeps Person 1)
          const primary = entry.member1;
          return {
            id: entry.id,
            type: 'SOLO',
            attendee: {
              ...primary,
              category: 'SOLO',
              team_id: undefined,
              team_name: undefined,
            },
          };
        }
        return entry;
      })
    );
  };

  // Add Solo
  const handleAddSolo = () => {
    const newEntryId = `entry-solo-${Date.now()}`;
    const newAttId = `att-${Date.now()}`;
    setEntries((prev) => [
      ...prev,
      {
        id: newEntryId,
        type: 'SOLO',
        attendee: {
          id: newAttId,
          name: '',
          email: '',
          phone: '',
          category: 'SOLO',
        },
      },
    ]);
  };

  // Add Team
  const handleAddTeam = () => {
    const newEntryId = `entry-team-${Date.now()}`;
    const m1Id = `att-${Date.now()}-m1`;
    const m2Id = `att-${Date.now()}-m2`;
    setEntries((prev) => [
      ...prev,
      {
        id: newEntryId,
        type: 'TEAM',
        teamName: '',
        member1: {
          id: m1Id,
          name: '',
          email: '',
          phone: '',
          category: 'TEAM',
          team_id: newEntryId,
          team_name: '',
        },
        member2: {
          id: m2Id,
          name: '',
          email: '',
          phone: '',
          category: 'TEAM',
          team_id: newEntryId,
          team_name: '',
        },
      },
    ]);
  };

  // Remove Entry
  const handleRemoveEntry = (entryId: string) => {
    if (entries.length <= 1) return;
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
  };

  // Validate entire form across all attendees & teams
  const validateForm = (): boolean => {
    const newFieldErrors: Record<string, AttendeeErrors> = {};
    const newTeamErrors: Record<string, string> = {};
    const seenEmails = new Set<string>();
    const seenPhones = new Set<string>();
    let hasError = false;

    // Validate entries
    for (const entry of entries) {
      if (entry.type === 'TEAM') {
        const teamNameErr = validateTeamName(entry.teamName);
        if (teamNameErr) {
          newTeamErrors[entry.id] = teamNameErr;
          hasError = true;
        }

        const members = [
          { att: entry.member1, label: 'Person 1' },
          { att: entry.member2, label: 'Person 2' },
        ];

        for (const { att } of members) {
          const attErr: AttendeeErrors = {};

          const nameErr = validateField(att.id, 'name', att.name);
          if (nameErr) {
            attErr.name = nameErr;
            hasError = true;
          }

          const emailErr = validateField(att.id, 'email', att.email);
          if (emailErr) {
            attErr.email = emailErr;
            hasError = true;
          } else {
            const cleanEmail = att.email.trim().toLowerCase();
            if (seenEmails.has(cleanEmail)) {
              attErr.email = 'Duplicate email. Each attendee must have a distinct email.';
              hasError = true;
            }
            seenEmails.add(cleanEmail);
          }

          const phoneErr = validateField(att.id, 'phone', att.phone);
          if (phoneErr) {
            attErr.phone = phoneErr;
            hasError = true;
          } else {
            const cleanPhone = att.phone.replace(/\D/g, '').slice(-10);
            if (seenPhones.has(cleanPhone)) {
              attErr.phone = 'Duplicate mobile number. Each attendee must have a unique phone.';
              hasError = true;
            }
            seenPhones.add(cleanPhone);
          }

          if (Object.keys(attErr).length > 0) {
            newFieldErrors[att.id] = attErr;
          }
        }
      } else {
        const att = entry.attendee;
        const attErr: AttendeeErrors = {};

        const nameErr = validateField(att.id, 'name', att.name);
        if (nameErr) {
          attErr.name = nameErr;
          hasError = true;
        }

        const emailErr = validateField(att.id, 'email', att.email);
        if (emailErr) {
          attErr.email = emailErr;
          hasError = true;
        } else {
          const cleanEmail = att.email.trim().toLowerCase();
          if (seenEmails.has(cleanEmail)) {
            attErr.email = 'Duplicate email. Each attendee must have a distinct email.';
            hasError = true;
          }
          seenEmails.add(cleanEmail);
        }

        const phoneErr = validateField(att.id, 'phone', att.phone);
        if (phoneErr) {
          attErr.phone = phoneErr;
          hasError = true;
        } else {
          const cleanPhone = att.phone.replace(/\D/g, '').slice(-10);
          if (seenPhones.has(cleanPhone)) {
            attErr.phone = 'Duplicate mobile number. Each attendee must have a unique phone.';
            hasError = true;
          }
          seenPhones.add(cleanPhone);
        }

        if (Object.keys(attErr).length > 0) {
          newFieldErrors[att.id] = attErr;
        }
      }
    }

    setFieldErrors(newFieldErrors);
    setTeamErrors(newTeamErrors);
    return !hasError;
  };

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();

    if (honeypot.trim() !== '') {
      console.warn('Bot submission blocked via honeypot.');
      return;
    }

    const isValid = validateForm();
    if (!isValid) {
      setValidationError('Please fix the highlighted errors before continuing.');
      return;
    }

    setValidationError(null);
    setIsChecking(true);

    const flattendAttendees = entriesToAttendees(entries);

    try {
      const checkRes = await api.checkAttendees(flattendAttendees);
      if (!checkRes.valid) {
        setValidationError(checkRes.error || 'One or more attendees are already registered.');
        setIsChecking(false);
        return;
      }
      setIsChecking(false);
      onNext();
    } catch (err: unknown) {
      const status = (err as any)?.status;
      if (status === 409 || status === 400 || status === 429) {
        const msg = (err as Error).message || 'One or more attendees are already registered.';
        setValidationError(msg);
        setIsChecking(false);
        return;
      }
      console.warn('Attendee pre-check skipped due to network or non-fatal status:', err);
      setIsChecking(false);
      onNext();
    }
  };

  return (
    <form onSubmit={handleContinue} className="space-y-8" noValidate>
      {/* Bot defense honeypot */}
      <div
        className="opacity-0 absolute -left-[9999px] -top-[9999px] h-0 w-0 overflow-hidden pointer-events-none"
        aria-hidden="true"
        tabIndex={-1}
      >
        <label htmlFor="hp_website">Leave this field blank</label>
        <input
          type="text"
          id="hp_website"
          name="hp_website"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      {/* Header */}
      <div>
        <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0A0A0A]">
          Attendee Details
        </h2>
        <p className="text-[#44443F] text-sm mt-1 leading-relaxed">
          Select solo or team format for each entry. Person 1 is the primary contact and will complete payment for this booking.
        </p>
      </div>

      {/* Global Alert Notification */}
      {validationError && (
        <motion.div
          role="alert"
          aria-live="polite"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-[#FFF5F5] border border-[#E53935]/40 text-[#D32F2F] text-sm flex items-center gap-3 shadow-xs"
        >
          <IconAlertCircle size={18} className="shrink-0 text-[#D32F2F]" />
          <span className="font-medium leading-relaxed">{validationError}</span>
        </motion.div>
      )}

      {/* Entries List */}
      <div className="space-y-6">
        <AnimatePresence initial={false}>
          {entries.map((entry, entryIndex) => {
            const isFirstEntry = entryIndex === 0;

            return (
              <motion.fieldset
                key={entry.id}
                layout
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                className={`p-6 sm:p-8 rounded-2xl bg-[#FFFFFF] border border-[#E6E6DF] shadow-studio space-y-6 relative border-l-4 ${
                  entry.type === 'TEAM' ? 'border-l-[#C2E600]' : 'border-l-[#0A0A0A]'
                }`}
              >
                {/* Entry Header: Title, Segmented Option Switch, Remove Button */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E6E6DF]">
                  <legend className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-full bg-[#F2F2EC] text-[#0A0A0A] text-xs font-bold font-mono flex items-center justify-center border border-[#E6E6DF]">
                      {entryIndex + 1}
                    </span>
                    <div>
                      <div className="text-base font-bold text-[#0A0A0A] flex items-center gap-2">
                        <span>
                          {isFirstEntry
                            ? 'Primary Registration (Payer)'
                            : entry.type === 'TEAM'
                            ? `Team Entry ${entryIndex + 1}`
                            : `Solo Attendee ${entryIndex + 1}`}
                        </span>
                      </div>
                      <span className="text-xs font-mono font-semibold text-[#55554F]">
                        {entry.type === 'TEAM'
                          ? `2 Participants · ₹${pricePerPerson * 2}`
                          : `1 Participant · ₹${pricePerPerson}`}
                      </span>
                    </div>
                  </legend>

                  <div className="flex items-center gap-3 self-start sm:self-auto">
                    {/* Solo vs Team Option Switcher - Only on Primary Registration */}
                    {isFirstEntry && (
                      <div
                        role="radiogroup"
                        aria-label="Registration format for primary attendee"
                        className="inline-flex items-center bg-[#F2F2EC] p-1 rounded-xl border border-[#E6E6DF] gap-1"
                      >
                        <button
                          type="button"
                          role="radio"
                          aria-checked={entry.type === 'SOLO'}
                          onClick={() => handleSwitchType(entry.id, 'SOLO')}
                          className={`min-h-[36px] px-3.5 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A0A0A] ${
                            entry.type === 'SOLO'
                              ? 'bg-[#FFFFFF] text-[#0A0A0A] shadow-xs border border-[#E6E6DF]'
                              : 'text-[#55554F] hover:text-[#0A0A0A] border border-transparent'
                          }`}
                        >
                          <IconUser size={13} />
                          <span>Solo</span>
                        </button>

                        <button
                          type="button"
                          role="radio"
                          aria-checked={entry.type === 'TEAM'}
                          onClick={() => handleSwitchType(entry.id, 'TEAM')}
                          className={`min-h-[36px] px-3.5 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A0A0A] ${
                            entry.type === 'TEAM'
                              ? 'bg-[#FFFFFF] text-[#0A0A0A] shadow-xs border border-[#E6E6DF]'
                              : 'text-[#55554F] hover:text-[#0A0A0A] border border-transparent'
                          }`}
                        >
                          <IconUsers size={13} />
                          <span>Team (2 People)</span>
                        </button>
                      </div>
                    )}

                    {!isFirstEntry && (
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                            entry.type === 'TEAM'
                              ? 'bg-[#FAFCF0] text-[#0A0A0A] border-[#C2E600]'
                              : 'bg-[#FAFAF7] text-[#55554F] border-[#E6E6DF]'
                          }`}
                        >
                          {entry.type === 'TEAM' ? (
                            <>
                              <IconUsers size={13} className="text-[#0A0A0A]" />
                              <span>Team Entry</span>
                            </>
                          ) : (
                            <>
                              <IconUser size={13} />
                              <span>Solo Attendee</span>
                            </>
                          )}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleRemoveEntry(entry.id)}
                          aria-label={`Remove Entry ${entryIndex + 1}`}
                          className="min-h-[36px] text-xs font-semibold text-[#55554F] hover:text-[#D32F2F] transition-colors flex items-center gap-1.5 py-1 px-2.5 rounded-lg hover:bg-[#FFF5F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D32F2F]"
                        >
                          <IconTrash size={14} />
                          <span className="hidden sm:inline">Remove</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* FORM CONTENT BASED ON SOLO VS TEAM */}
                {entry.type === 'SOLO' ? (
                  /* SOLO FORM */
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                      {/* Name */}
                      <div className="space-y-1.5">
                        <label
                          htmlFor={`name-${entry.attendee.id}`}
                          className="block text-xs font-bold text-[#33332D] tracking-wide"
                        >
                          Full Name <span className="text-[#D32F2F]">*</span>
                        </label>
                        <input
                          id={`name-${entry.attendee.id}`}
                          name={`name_${entry.attendee.id}`}
                          type="text"
                          inputMode="text"
                          autoComplete="name"
                          maxLength={100}
                          placeholder="e.g. Rohan Sharma"
                          value={entry.attendee.name}
                          onBlur={(e) => handleBlur(entry.attendee.id, 'name', e.target.value)}
                          onChange={(e) =>
                            handleUpdateSoloField(entry.id, 'name', e.target.value)
                          }
                          aria-required="true"
                          aria-invalid={!!fieldErrors[entry.attendee.id]?.name}
                          className={`field-input w-full text-base sm:text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A0A0A] ${
                            fieldErrors[entry.attendee.id]?.name ? '!border-[#D32F2F] !bg-[#FFF5F5]' : ''
                          }`}
                          required
                        />
                        {fieldErrors[entry.attendee.id]?.name && (
                          <p className="text-xs text-[#D32F2F] font-medium flex items-center gap-1 mt-1">
                            <IconAlertCircle size={12} className="shrink-0" />
                            <span>{fieldErrors[entry.attendee.id]?.name}</span>
                          </p>
                        )}
                      </div>

                      {/* Email */}
                      <div className="space-y-1.5">
                        <label
                          htmlFor={`email-${entry.attendee.id}`}
                          className="block text-xs font-bold text-[#33332D] tracking-wide"
                        >
                          Email Address <span className="text-[#D32F2F]">*</span>
                        </label>
                        <input
                          id={`email-${entry.attendee.id}`}
                          name={`email_${entry.attendee.id}`}
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          maxLength={120}
                          placeholder="e.g. rohan@example.com"
                          value={entry.attendee.email}
                          onBlur={(e) => handleBlur(entry.attendee.id, 'email', e.target.value)}
                          onChange={(e) =>
                            handleUpdateSoloField(entry.id, 'email', e.target.value)
                          }
                          aria-required="true"
                          aria-invalid={!!fieldErrors[entry.attendee.id]?.email}
                          className={`field-input w-full text-base sm:text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A0A0A] ${
                            fieldErrors[entry.attendee.id]?.email ? '!border-[#D32F2F] !bg-[#FFF5F5]' : ''
                          }`}
                          required
                        />
                        {fieldErrors[entry.attendee.id]?.email && (
                          <p className="text-xs text-[#D32F2F] font-medium flex items-center gap-1 mt-1">
                            <IconAlertCircle size={12} className="shrink-0" />
                            <span>{fieldErrors[entry.attendee.id]?.email}</span>
                          </p>
                        )}
                      </div>

                      {/* Phone */}
                      <div className="space-y-1.5">
                        <label
                          htmlFor={`phone-${entry.attendee.id}`}
                          className="block text-xs font-bold text-[#33332D] tracking-wide"
                        >
                          Phone Number <span className="text-[#D32F2F]">*</span>
                        </label>
                        <div className="relative flex items-center">
                          <span className="absolute left-3.5 text-xs text-[#44443F] font-bold pointer-events-none select-none">
                            +91
                          </span>
                          <input
                            id={`phone-${entry.attendee.id}`}
                            name={`phone_${entry.attendee.id}`}
                            type="tel"
                            inputMode="numeric"
                            autoComplete="tel"
                            maxLength={10}
                            placeholder="9876543210"
                            value={entry.attendee.phone}
                            onBlur={(e) => handleBlur(entry.attendee.id, 'phone', e.target.value)}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                              handleUpdateSoloField(entry.id, 'phone', val);
                            }}
                            aria-required="true"
                            aria-invalid={!!fieldErrors[entry.attendee.id]?.phone}
                            className={`field-input w-full !pl-12 text-base sm:text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A0A0A] ${
                              fieldErrors[entry.attendee.id]?.phone ? '!border-[#D32F2F] !bg-[#FFF5F5]' : ''
                            }`}
                            required
                          />
                        </div>
                        {fieldErrors[entry.attendee.id]?.phone && (
                          <p className="text-xs text-[#D32F2F] font-medium flex items-center gap-1 mt-1">
                            <IconAlertCircle size={12} className="shrink-0" />
                            <span>{fieldErrors[entry.attendee.id]?.phone}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* TEAM FORM: TEAM NAME + PERSON 1 + PERSON 2 */
                  <div className="space-y-6">
                    {/* Team Name Input */}
                    <div className="p-4 sm:p-5 rounded-xl bg-[#FAFAF7] border border-[#E6E6DF] space-y-2">
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor={`team-name-${entry.id}`}
                          className="text-xs font-bold text-[#0A0A0A] flex items-center gap-1.5"
                        >
                          <IconTag size={14} className="text-[#0A0A0A]" />
                          <span>Team Name</span>
                          <span className="text-[#D32F2F]">*</span>
                        </label>
                        <span className="text-[11px] font-mono text-[#8C8C85]">
                          Both members will share this team name
                        </span>
                      </div>
                      <input
                        id={`team-name-${entry.id}`}
                        name={`team_name_${entry.id}`}
                        type="text"
                        maxLength={60}
                        placeholder="e.g. Code Ninjas, Team Alpha"
                        value={entry.teamName}
                        onBlur={(e) => handleTeamBlur(entry.id, e.target.value)}
                        onChange={(e) => handleUpdateTeamName(entry.id, e.target.value)}
                        aria-required="true"
                        aria-invalid={!!teamErrors[entry.id]}
                        className={`field-input w-full bg-[#FFFFFF] text-base sm:text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A0A0A] ${
                          teamErrors[entry.id] ? '!border-[#D32F2F] !bg-[#FFF5F5]' : ''
                        }`}
                        required
                      />
                      {teamErrors[entry.id] && (
                        <p className="text-xs text-[#D32F2F] font-medium flex items-center gap-1 mt-1">
                          <IconAlertCircle size={12} className="shrink-0" />
                          <span>{teamErrors[entry.id]}</span>
                        </p>
                      )}
                    </div>

                    {/* Member 1 (Lead / Payer if first entry) */}
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-[#C2E600] text-[#0A0A0A] text-[11px] font-bold font-mono flex items-center justify-center">
                          1
                        </span>
                        <h4 className="text-xs font-bold text-[#0A0A0A] uppercase tracking-wider font-mono">
                          {isFirstEntry ? 'Person 1 (Primary Contact & Payer)' : 'Person 1 (Team Member)'}
                        </h4>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                        {/* Member 1 Name */}
                        <div className="space-y-1.5">
                          <label
                            htmlFor={`m1-name-${entry.member1.id}`}
                            className="block text-xs font-bold text-[#33332D] tracking-wide"
                          >
                            Full Name <span className="text-[#D32F2F]">*</span>
                          </label>
                          <input
                            id={`m1-name-${entry.member1.id}`}
                            name={`m1_name_${entry.member1.id}`}
                            type="text"
                            maxLength={100}
                            placeholder="e.g. Rohan Sharma"
                            value={entry.member1.name}
                            onBlur={(e) => handleBlur(entry.member1.id, 'name', e.target.value)}
                            onChange={(e) =>
                              handleUpdateTeamMemberField(entry.id, 'member1', 'name', e.target.value)
                            }
                            aria-required="true"
                            aria-invalid={!!fieldErrors[entry.member1.id]?.name}
                            className={`field-input w-full text-base sm:text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A0A0A] ${
                              fieldErrors[entry.member1.id]?.name ? '!border-[#D32F2F] !bg-[#FFF5F5]' : ''
                            }`}
                            required
                          />
                          {fieldErrors[entry.member1.id]?.name && (
                            <p className="text-xs text-[#D32F2F] font-medium flex items-center gap-1 mt-1">
                              <IconAlertCircle size={12} className="shrink-0" />
                              <span>{fieldErrors[entry.member1.id]?.name}</span>
                            </p>
                          )}
                        </div>

                        {/* Member 1 Email */}
                        <div className="space-y-1.5">
                          <label
                            htmlFor={`m1-email-${entry.member1.id}`}
                            className="block text-xs font-bold text-[#33332D] tracking-wide"
                          >
                            Email Address <span className="text-[#D32F2F]">*</span>
                          </label>
                          <input
                            id={`m1-email-${entry.member1.id}`}
                            name={`m1_email_${entry.member1.id}`}
                            type="email"
                            maxLength={120}
                            placeholder="e.g. rohan@example.com"
                            value={entry.member1.email}
                            onBlur={(e) => handleBlur(entry.member1.id, 'email', e.target.value)}
                            onChange={(e) =>
                              handleUpdateTeamMemberField(entry.id, 'member1', 'email', e.target.value)
                            }
                            aria-required="true"
                            aria-invalid={!!fieldErrors[entry.member1.id]?.email}
                            className={`field-input w-full text-base sm:text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A0A0A] ${
                              fieldErrors[entry.member1.id]?.email ? '!border-[#D32F2F] !bg-[#FFF5F5]' : ''
                            }`}
                            required
                          />
                          {fieldErrors[entry.member1.id]?.email && (
                            <p className="text-xs text-[#D32F2F] font-medium flex items-center gap-1 mt-1">
                              <IconAlertCircle size={12} className="shrink-0" />
                              <span>{fieldErrors[entry.member1.id]?.email}</span>
                            </p>
                          )}
                        </div>

                        {/* Member 1 Phone */}
                        <div className="space-y-1.5">
                          <label
                            htmlFor={`m1-phone-${entry.member1.id}`}
                            className="block text-xs font-bold text-[#33332D] tracking-wide"
                          >
                            Phone Number <span className="text-[#D32F2F]">*</span>
                          </label>
                          <div className="relative flex items-center">
                            <span className="absolute left-3.5 text-xs text-[#44443F] font-bold pointer-events-none select-none">
                              +91
                            </span>
                            <input
                              id={`m1-phone-${entry.member1.id}`}
                              name={`m1_phone_${entry.member1.id}`}
                              type="tel"
                              maxLength={10}
                              placeholder="9876543210"
                              value={entry.member1.phone}
                              onBlur={(e) => handleBlur(entry.member1.id, 'phone', e.target.value)}
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                                handleUpdateTeamMemberField(entry.id, 'member1', 'phone', val);
                              }}
                              aria-required="true"
                              aria-invalid={!!fieldErrors[entry.member1.id]?.phone}
                              className={`field-input w-full !pl-12 text-base sm:text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A0A0A] ${
                                fieldErrors[entry.member1.id]?.phone ? '!border-[#D32F2F] !bg-[#FFF5F5]' : ''
                              }`}
                              required
                            />
                          </div>
                          {fieldErrors[entry.member1.id]?.phone && (
                            <p className="text-xs text-[#D32F2F] font-medium flex items-center gap-1 mt-1">
                              <IconAlertCircle size={12} className="shrink-0" />
                              <span>{fieldErrors[entry.member1.id]?.phone}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Member 2 */}
                    <div className="space-y-3 pt-3 border-t border-[#E6E6DF]">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-[#E6E6DF] text-[#0A0A0A] text-[11px] font-bold font-mono flex items-center justify-center">
                          2
                        </span>
                        <h4 className="text-xs font-bold text-[#0A0A0A] uppercase tracking-wider font-mono">
                          Person 2 (Team Member)
                        </h4>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                        {/* Member 2 Name */}
                        <div className="space-y-1.5">
                          <label
                            htmlFor={`m2-name-${entry.member2.id}`}
                            className="block text-xs font-bold text-[#33332D] tracking-wide"
                          >
                            Full Name <span className="text-[#D32F2F]">*</span>
                          </label>
                          <input
                            id={`m2-name-${entry.member2.id}`}
                            name={`m2_name_${entry.member2.id}`}
                            type="text"
                            maxLength={100}
                            placeholder="e.g. Priya Patel"
                            value={entry.member2.name}
                            onBlur={(e) => handleBlur(entry.member2.id, 'name', e.target.value)}
                            onChange={(e) =>
                              handleUpdateTeamMemberField(entry.id, 'member2', 'name', e.target.value)
                            }
                            aria-required="true"
                            aria-invalid={!!fieldErrors[entry.member2.id]?.name}
                            className={`field-input w-full text-base sm:text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A0A0A] ${
                              fieldErrors[entry.member2.id]?.name ? '!border-[#D32F2F] !bg-[#FFF5F5]' : ''
                            }`}
                            required
                          />
                          {fieldErrors[entry.member2.id]?.name && (
                            <p className="text-xs text-[#D32F2F] font-medium flex items-center gap-1 mt-1">
                              <IconAlertCircle size={12} className="shrink-0" />
                              <span>{fieldErrors[entry.member2.id]?.name}</span>
                            </p>
                          )}
                        </div>

                        {/* Member 2 Email */}
                        <div className="space-y-1.5">
                          <label
                            htmlFor={`m2-email-${entry.member2.id}`}
                            className="block text-xs font-bold text-[#33332D] tracking-wide"
                          >
                            Email Address <span className="text-[#D32F2F]">*</span>
                          </label>
                          <input
                            id={`m2-email-${entry.member2.id}`}
                            name={`m2_email_${entry.member2.id}`}
                            type="email"
                            maxLength={120}
                            placeholder="e.g. priya@example.com"
                            value={entry.member2.email}
                            onBlur={(e) => handleBlur(entry.member2.id, 'email', e.target.value)}
                            onChange={(e) =>
                              handleUpdateTeamMemberField(entry.id, 'member2', 'email', e.target.value)
                            }
                            aria-required="true"
                            aria-invalid={!!fieldErrors[entry.member2.id]?.email}
                            className={`field-input w-full text-base sm:text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A0A0A] ${
                              fieldErrors[entry.member2.id]?.email ? '!border-[#D32F2F] !bg-[#FFF5F5]' : ''
                            }`}
                            required
                          />
                          {fieldErrors[entry.member2.id]?.email && (
                            <p className="text-xs text-[#D32F2F] font-medium flex items-center gap-1 mt-1">
                              <IconAlertCircle size={12} className="shrink-0" />
                              <span>{fieldErrors[entry.member2.id]?.email}</span>
                            </p>
                          )}
                        </div>

                        {/* Member 2 Phone */}
                        <div className="space-y-1.5">
                          <label
                            htmlFor={`m2-phone-${entry.member2.id}`}
                            className="block text-xs font-bold text-[#33332D] tracking-wide"
                          >
                            Phone Number <span className="text-[#D32F2F]">*</span>
                          </label>
                          <div className="relative flex items-center">
                            <span className="absolute left-3.5 text-xs text-[#44443F] font-bold pointer-events-none select-none">
                              +91
                            </span>
                            <input
                              id={`m2-phone-${entry.member2.id}`}
                              name={`m2_phone_${entry.member2.id}`}
                              type="tel"
                              maxLength={10}
                              placeholder="9876543211"
                              value={entry.member2.phone}
                              onBlur={(e) => handleBlur(entry.member2.id, 'phone', e.target.value)}
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                                handleUpdateTeamMemberField(entry.id, 'member2', 'phone', val);
                              }}
                              aria-required="true"
                              aria-invalid={!!fieldErrors[entry.member2.id]?.phone}
                              className={`field-input w-full !pl-12 text-base sm:text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A0A0A] ${
                                fieldErrors[entry.member2.id]?.phone ? '!border-[#D32F2F] !bg-[#FFF5F5]' : ''
                              }`}
                              required
                            />
                          </div>
                          {fieldErrors[entry.member2.id]?.phone && (
                            <p className="text-xs text-[#D32F2F] font-medium flex items-center gap-1 mt-1">
                              <IconAlertCircle size={12} className="shrink-0" />
                              <span>{fieldErrors[entry.member2.id]?.phone}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.fieldset>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Add options: User can add another Solo or add another Team */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={handleAddSolo}
          className="min-h-[52px] py-4 px-6 rounded-2xl border-2 border-dashed border-[#E6E6DF] hover:border-[#0A0A0A] text-[#0A0A0A] text-sm font-bold transition-all flex items-center justify-center gap-2 bg-[#FFFFFF] hover:bg-[#FAFAF7] shadow-card-subtle cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A0A0A]"
        >
          <IconPlus size={16} />
          <span>Add Solo Attendee (+₹{pricePerPerson})</span>
        </button>

        <button
          type="button"
          onClick={handleAddTeam}
          className="min-h-[52px] py-4 px-6 rounded-2xl border-2 border-dashed border-[#C2E600] hover:border-[#0A0A0A] text-[#0A0A0A] text-sm font-bold transition-all flex items-center justify-center gap-2 bg-[#FAFCF0] hover:bg-[#F4F9D8] shadow-card-subtle cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A0A0A]"
        >
          <IconPlus size={16} />
          <span>Add Team (2 People · +₹{pricePerPerson * 2})</span>
        </button>
      </div>

      {/* Trust Footnote */}
      <div className="flex items-center gap-2 text-xs text-[#55554F] px-1">
        <IconShield size={14} className="text-[#0A0A0A] shrink-0" />
        <span>Your data is securely processed with 256-bit encryption. Individual passes are emailed automatically.</span>
      </div>

      {/* Continue Button */}
      <div className="pt-2 flex justify-end">
        <button
          type="submit"
          disabled={isChecking}
          className="min-h-[48px] h-12 px-8 bg-[#0A0A0A] hover:bg-[#222222] text-[#FAFAF7] text-sm font-bold rounded-xl inline-flex items-center gap-2.5 shadow-md transition-all hover:scale-105 group cursor-pointer disabled:opacity-75 disabled:hover:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2E600]"
        >
          {isChecking ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Verifying availability...</span>
            </>
          ) : (
            <>
              <span>Continue to review</span>
              <span className="w-5 h-5 rounded-full bg-[#C2E600] text-[#0A0A0A] flex items-center justify-center transition-transform group-hover:translate-x-0.5">
                <IconArrowRight size={12} />
              </span>
            </>
          )}
        </button>
      </div>
    </form>
  );
};
