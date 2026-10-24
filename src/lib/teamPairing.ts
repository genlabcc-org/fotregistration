import type { AttendeeInput } from '../types';

export interface TeamGroup {
  teamNumber: number;
  teamIdentifier: string;
  teamName?: string;
  members: AttendeeInput[];
}

export interface ComputedTeamPairing {
  teams: TeamGroup[];
  solos: AttendeeInput[];
  oddPersonId: string | null;
  oddPersonNotice: boolean;
  oddOneOutId: string | null;
  totalPeople: number;
  teamCount: number;
  soloCount: number;
  summaryText: string;
}

export function computePairing(attendees: AttendeeInput[]): ComputedTeamPairing {
  const teamAttendees = attendees.filter((a) => a.category === 'TEAM');
  const explicitSolos = attendees.filter((a) => a.category === 'SOLO');

  const teams: TeamGroup[] = [];
  const convertedSolos: AttendeeInput[] = [];
  let oddPersonId: string | null = null;

  // Group by team_id if available, otherwise pair sequentially
  const teamIdMap = new Map<string, AttendeeInput[]>();
  const unassignedTeam: AttendeeInput[] = [];

  for (const att of teamAttendees) {
    if (att.team_id) {
      const list = teamIdMap.get(att.team_id) || [];
      list.push(att);
      teamIdMap.set(att.team_id, list);
    } else {
      unassignedTeam.push(att);
    }
  }

  let teamIndex = 1;

  // Process grouped teams
  for (const [, members] of teamIdMap.entries()) {
    for (let i = 0; i < members.length; i += 2) {
      if (i + 1 < members.length) {
        const customName = members[i].team_name?.trim() || members[i + 1].team_name?.trim();
        const teamIdentifier = customName || `Team ${String(teamIndex).padStart(2, '0')}`;
        teams.push({
          teamNumber: teamIndex,
          teamIdentifier,
          teamName: customName || undefined,
          members: [members[i], members[i + 1]],
        });
        teamIndex++;
      } else {
        const odd = members[i];
        oddPersonId = odd.id;
        convertedSolos.push(odd);
      }
    }
  }

  // Process unassigned team attendees
  for (let i = 0; i < unassignedTeam.length; i += 2) {
    if (i + 1 < unassignedTeam.length) {
      const customName = unassignedTeam[i].team_name?.trim() || unassignedTeam[i + 1].team_name?.trim();
      const teamIdentifier = customName || `Team ${String(teamIndex).padStart(2, '0')}`;
      teams.push({
        teamNumber: teamIndex,
        teamIdentifier,
        teamName: customName || undefined,
        members: [unassignedTeam[i], unassignedTeam[i + 1]],
      });
      teamIndex++;
    } else {
      const odd = unassignedTeam[i];
      oddPersonId = odd.id;
      convertedSolos.push(odd);
    }
  }

  const allSolos = [...explicitSolos, ...convertedSolos];

  // Natural language grammar
  const peopleCount = attendees.length;
  const peopleStr = peopleCount === 1 ? '1 person' : `${peopleCount} people`;
  const teamStr = teams.length === 1 ? '1 team' : `${teams.length} teams`;
  const soloStr = allSolos.length === 1 ? '1 solo' : `${allSolos.length} solos`;

  let summaryText = peopleStr;
  if (teams.length > 0 && allSolos.length > 0) {
    summaryText = `${peopleStr} · ${teamStr} · ${soloStr}`;
  } else if (teams.length > 0) {
    summaryText = `${peopleStr} · ${teamStr}`;
  } else {
    summaryText = `${peopleStr} · ${soloStr}`;
  }

  return {
    teams,
    solos: allSolos,
    oddPersonId,
    oddPersonNotice: !!oddPersonId,
    oddOneOutId: oddPersonId,
    totalPeople: peopleCount,
    teamCount: teams.length,
    soloCount: allSolos.length,
    summaryText,
  };
}

export const computeTeamPairings = computePairing;
