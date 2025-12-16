
export interface RubricLevel {
  id: string;
  label: string; // e.g., "Excellent", "Good"
  score: number;
  description: string;
}

export interface RubricCriterion {
  id: string;
  title: string;
  description: string;
  weight: number; // Percentage or multiplier
  levels: RubricLevel[];
}

export interface Rubric {
  id: string;
  title: string;
  subject?: string; // New field for Course/Subject Name
  type?: 'individual' | 'group'; // New field for Assignment Type
  description: string;
  criteria: RubricCriterion[];
  passingPercentage: number; // 0-100
  assignmentWeight?: number; // e.g. 30% of course grade
  peerEvalWeight?: number; // New: Percentage (0-100) of assignment grade allocated to peer eval
  // New Alignment Fields
  assignmentBrief?: string;
  plos?: string[]; // Program Learning Outcomes
  clos?: string[]; // Course Learning Outcomes
}

export type AssigneeType = 'individual' | 'group';

export interface Assignee {
  id: string;
  name: string;
  type: AssigneeType;
  members?: string[]; // For groups
}

export interface GradeEntry {
  criterionId: string;
  levelId: string;
  score: number;
}

export interface PeerEvaluation {
  id: string;
  evaluator: string; // Who gave the review
  subject: string;   // Who received the review (formerly memberName)
  score: number;     // 0 - 100
  feedback: string;
}

export interface Assessment {
  id: string; // Composite key usually
  rubricId: string; // Link to specific assignment
  assigneeId: string;
  entries: GradeEntry[];
  peerEvaluations?: PeerEvaluation[]; 
  totalScore: number;
  maxScore: number;
  feedback: string;
  submissionText?: string;
  locked: boolean;
  lastUpdated: number;
}

export enum AppView {
  DASHBOARD = 'DASHBOARD',
  SUBJECT_ASSIGNMENT = 'SUBJECT_ASSIGNMENT',
  RUBRIC_EDITOR = 'RUBRIC_EDITOR',
  ASSIGNEES = 'ASSIGNEES',
  GRADING = 'GRADING',
  EXPORT = 'EXPORT',
  PEER_KIOSK = 'PEER_KIOSK'
}

export type UserRole = 'TEACHER' | 'ASSESSOR';
