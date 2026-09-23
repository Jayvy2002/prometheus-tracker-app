export interface AdminQualification {
  id: string;
  title: string;
  qualification_type: string;
  issuer: string;
  declared_at: string;
  expires_on: string | null;
  proof_present: boolean;
  coach_label: string;
}

export interface AdminExerciseProposal {
  id: string;
  name: string;
  muscles: string;
  description: string;
  suggestion_name_fr: string;
  created_at: string;
  updated_at: string;
}

export interface AdminExerciseDuplicate {
  left_id: string;
  right_id: string;
  left_name: string;
  right_name: string;
  score: number;
}

export interface AdminProblemImport {
  id: string;
  kind: string;
  status: string;
  created_at: string;
  row_count: number;
  error_count: number;
  ready_count: number;
  ignored_count: number;
  subject_kind: 'account' | 'provisional';
  coach_label: string;
  error_codes: string[] | null;
}

/** A failed import attempt with no import row: parse failure or unexpected error. */
export interface AdminImportIncident {
  id: string;
  kind: 'workout' | 'body_weight' | null;
  error_code: string;
  created_at: string;
  coach_label: string;
}

export interface AdminReport {
  id: string;
  status: string;
  subject_type: string;
  category: string;
  context: string;
  directory_hold_active: boolean;
  created_at: string;
  target_label: string;
}

export interface AdminOperator {
  user_id: string;
  granted_at: string;
}
