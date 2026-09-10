/*
  # Exercise Database with AI Verification

  1. New Tables
    - `exercises` - Community exercise database
      - `id` (uuid, primary key)
      - `name` (text, unique, not null) - Exercise name
      - `name_fr` (text) - French name
      - `primary_muscles` (text[]) - Primary muscles targeted
      - `secondary_muscles` (text[]) - Secondary muscles targeted
      - `category` (text) - e.g. 'compound', 'isolation', 'cardio', 'stretch'
      - `equipment` (text) - e.g. 'barbell', 'dumbbell', 'machine', 'bodyweight'
      - `instructions` (text) - How to perform the exercise
      - `tips` (text) - Form tips and common mistakes
      - `difficulty` (text) - 'beginner', 'intermediate', 'advanced'
      - `verified` (boolean) - Whether AI has verified this exercise
      - `created_by` (uuid, nullable) - User who submitted it (null = seeded)
      - `created_at` (timestamptz)

    - `exercise_requests` - User submissions pending AI verification
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `name` (text) - Proposed exercise name
      - `muscles` (text) - User-provided muscle info
      - `status` (text) - 'pending', 'processing', 'approved', 'rejected'
      - `result_exercise_id` (uuid, nullable) - Linked exercise if approved
      - `error_message` (text) - Rejection reason or error
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - RLS enabled on both tables
    - `exercises`: All authenticated users can read verified exercises; users can read their own unverified
    - `exercise_requests`: Users can only read/create their own requests

  3. Seed Data
    - Common exercises pre-populated with muscle info
*/

-- Exercises master table
CREATE TABLE IF NOT EXISTS exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  name_fr text DEFAULT '',
  primary_muscles text[] DEFAULT '{}',
  secondary_muscles text[] DEFAULT '{}',
  category text NOT NULL DEFAULT 'compound',
  equipment text NOT NULL DEFAULT 'barbell',
  instructions text DEFAULT '',
  tips text DEFAULT '',
  difficulty text NOT NULL DEFAULT 'intermediate',
  verified boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exercises_name ON exercises USING btree (lower(name));
CREATE INDEX IF NOT EXISTS idx_exercises_verified ON exercises (verified);
CREATE INDEX IF NOT EXISTS idx_exercises_category ON exercises (category);
CREATE INDEX IF NOT EXISTS idx_exercises_primary_muscles ON exercises USING gin (primary_muscles);

ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read verified exercises"
  ON exercises FOR SELECT
  TO authenticated
  USING (verified = true);

CREATE POLICY "Users can read their own unverified exercises"
  ON exercises FOR SELECT
  TO authenticated
  USING (created_by = auth.uid() AND verified = false);

CREATE POLICY "Users can insert exercises"
  ON exercises FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Exercise requests table
CREATE TABLE IF NOT EXISTS exercise_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL DEFAULT '',
  muscles text DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  result_exercise_id uuid REFERENCES exercises(id) ON DELETE SET NULL,
  error_message text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exercise_requests_user ON exercise_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_exercise_requests_status ON exercise_requests (status);

ALTER TABLE exercise_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own exercise requests"
  ON exercise_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create exercise requests"
  ON exercise_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own exercise requests"
  ON exercise_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Seed common exercises
INSERT INTO exercises (name, name_fr, primary_muscles, secondary_muscles, category, equipment, instructions, tips, difficulty, verified) VALUES
  ('Bench Press', 'Developpe couche', ARRAY['chest'], ARRAY['triceps','front_delts'], 'compound', 'barbell', 'Allongez-vous sur le banc, pieds au sol. Saisissez la barre legerement plus large que les epaules. Descendez la barre vers le milieu de la poitrine, puis poussez vers le haut.', 'Gardez les omoplates serrees. Ne rebondissez pas la barre sur la poitrine.', 'beginner', true),
  ('Squat', 'Squat', ARRAY['quadriceps','glutes'], ARRAY['hamstrings','core','lower_back'], 'compound', 'barbell', 'Placez la barre sur les trapezes. Descendez en pliant les genoux et les hanches comme pour vous asseoir. Descendez jusqu''a ce que les cuisses soient paralleles au sol.', 'Gardez le dos droit et les genoux dans l''axe des pieds. Poussez a travers les talons.', 'beginner', true),
  ('Deadlift', 'Souleve de terre', ARRAY['hamstrings','glutes','lower_back'], ARRAY['quadriceps','traps','forearms','core'], 'compound', 'barbell', 'Pieds a largeur des hanches, saisissez la barre. Poussez avec les jambes tout en gardant le dos droit pour soulever la barre le long du corps.', 'Ne jamais arrondir le dos. La barre doit rester proche du corps.', 'intermediate', true),
  ('Overhead Press', 'Developpe militaire', ARRAY['front_delts','side_delts'], ARRAY['triceps','traps','core'], 'compound', 'barbell', 'Debout, saisissez la barre au niveau des epaules. Poussez la barre au-dessus de la tete jusqu''a extension complete des bras.', 'Contractez les fessiers et les abdos pour la stabilite. Evitez de cambrer excessivement.', 'intermediate', true),
  ('Barbell Row', 'Rowing barre', ARRAY['lats','rhomboids'], ARRAY['biceps','rear_delts','traps','lower_back'], 'compound', 'barbell', 'Penchez-vous en avant avec le dos droit. Tirez la barre vers le nombril en serrant les omoplates.', 'Gardez le buste incline a ~45 degres. Ne tirez pas avec le bas du dos.', 'intermediate', true),
  ('Pull-up', 'Traction', ARRAY['lats','biceps'], ARRAY['rhomboids','rear_delts','forearms','core'], 'compound', 'bodyweight', 'Saisissez la barre en pronation. Tirez-vous vers le haut jusqu''a ce que le menton depasse la barre.', 'Initiez le mouvement en tirant les coudes vers le bas. Evitez le balancement.', 'intermediate', true),
  ('Chin-up', 'Traction supination', ARRAY['biceps','lats'], ARRAY['rhomboids','rear_delts','forearms'], 'compound', 'bodyweight', 'Saisissez la barre en supination (paumes vers vous). Tirez-vous vers le haut.', 'Plus facile que les tractions classiques. Excellent pour les biceps.', 'beginner', true),
  ('Dip', 'Dips', ARRAY['chest','triceps'], ARRAY['front_delts','core'], 'compound', 'bodyweight', 'Saisissez les barres paralleles. Descendez en pliant les coudes, puis poussez vers le haut.', 'Penchez-vous en avant pour cibler la poitrine, restez droit pour les triceps.', 'intermediate', true),
  ('Lat Pulldown', 'Tirage vertical', ARRAY['lats'], ARRAY['biceps','rhomboids','rear_delts'], 'compound', 'machine', 'Asseyez-vous face a la machine. Tirez la barre vers le haut de la poitrine en serrant les omoplates.', 'Ne tirez pas derriere la nuque. Gardez le buste legerement incline en arriere.', 'beginner', true),
  ('Cable Row', 'Tirage horizontal', ARRAY['lats','rhomboids'], ARRAY['biceps','rear_delts','traps'], 'compound', 'machine', 'Asseyez-vous face a la poulie basse. Tirez la poignee vers le nombril en serrant les omoplates.', 'Gardez le dos droit. Ne vous balancez pas en arriere.', 'beginner', true),
  ('Incline Bench Press', 'Developpe incline', ARRAY['upper_chest','front_delts'], ARRAY['triceps'], 'compound', 'barbell', 'Allongez-vous sur un banc incline a 30-45 degres. Descendez la barre vers le haut de la poitrine, puis poussez.', 'L''angle ideal est entre 30 et 45 degres pour cibler le haut des pectoraux.', 'beginner', true),
  ('Decline Bench Press', 'Developpe decline', ARRAY['lower_chest'], ARRAY['triceps','front_delts'], 'compound', 'barbell', 'Allongez-vous sur un banc decline. Descendez la barre vers le bas de la poitrine.', 'Cible le bas des pectoraux. Attention a la pression sanguine en position declinee.', 'intermediate', true),
  ('Dumbbell Press', 'Developpe halteres', ARRAY['chest'], ARRAY['triceps','front_delts'], 'compound', 'dumbbell', 'Allongez-vous avec un haltere dans chaque main. Poussez les halteres vers le haut, puis redescendez lentement.', 'Les halteres permettent une plus grande amplitude qu''a la barre.', 'beginner', true),
  ('Dumbbell Fly', 'Ecarte halteres', ARRAY['chest'], ARRAY['front_delts'], 'isolation', 'dumbbell', 'Allongez-vous avec les bras tendus au-dessus de la poitrine. Ouvrez les bras en arc de cercle, puis revenez.', 'Gardez une legere flexion des coudes. Ne descendez pas trop bas.', 'beginner', true),
  ('Leg Press', 'Presse a cuisses', ARRAY['quadriceps','glutes'], ARRAY['hamstrings'], 'compound', 'machine', 'Asseyez-vous dans la machine. Poussez la plateforme avec les pieds jusqu''a extension des jambes.', 'Ne verrouillez pas les genoux en extension. Gardez le dos bien plaque.', 'beginner', true),
  ('Leg Extension', 'Extension des jambes', ARRAY['quadriceps'], ARRAY[]::text[], 'isolation', 'machine', 'Asseyez-vous dans la machine. Etendez les jambes en contractant les quadriceps.', 'Mouvement lent et controle. Ideal en finition ou en pre-fatigue.', 'beginner', true),
  ('Leg Curl', 'Curl jambes', ARRAY['hamstrings'], ARRAY[]::text[], 'isolation', 'machine', 'Allongez-vous face contre le banc. Flechissez les jambes en contractant les ischio-jambiers.', 'Ne laissez pas les hanches se soulever du banc.', 'beginner', true),
  ('Romanian Deadlift', 'Souleve de terre roumain', ARRAY['hamstrings','glutes'], ARRAY['lower_back','core'], 'compound', 'barbell', 'Debout avec la barre. Descendez en poussant les hanches en arriere, jambes presque tendues.', 'Gardez la barre proche des jambes. Ressentez l''etirement des ischio-jambiers.', 'intermediate', true),
  ('Bulgarian Split Squat', 'Squat bulgare', ARRAY['quadriceps','glutes'], ARRAY['hamstrings','core'], 'compound', 'dumbbell', 'Un pied devant, l''autre sur un banc derriere. Descendez en pliant le genou avant.', 'Gardez le buste droit. Le genou avant ne depasse pas les orteils.', 'intermediate', true),
  ('Lunge', 'Fente', ARRAY['quadriceps','glutes'], ARRAY['hamstrings','core'], 'compound', 'dumbbell', 'Faites un grand pas en avant et descendez le genou arriere vers le sol. Revenez a la position initiale.', 'Gardez le buste droit. Alternez les jambes.', 'beginner', true),
  ('Bicep Curl', 'Curl biceps', ARRAY['biceps'], ARRAY['forearms'], 'isolation', 'dumbbell', 'Debout, bras le long du corps. Flechissez les coudes pour monter les halteres vers les epaules.', 'Ne balancez pas le corps. Gardez les coudes fixes.', 'beginner', true),
  ('Tricep Extension', 'Extension triceps', ARRAY['triceps'], ARRAY[]::text[], 'isolation', 'dumbbell', 'Un haltere tenu a deux mains au-dessus de la tete. Descendez derriere la tete en flechissant les coudes.', 'Gardez les coudes proches de la tete et fixes.', 'beginner', true),
  ('Lateral Raise', 'Elevation laterale', ARRAY['side_delts'], ARRAY['traps'], 'isolation', 'dumbbell', 'Debout, bras le long du corps. Levez les bras sur les cotes jusqu''a hauteur des epaules.', 'Gardez une legere flexion des coudes. Controle la descente.', 'beginner', true),
  ('Face Pull', 'Face pull', ARRAY['rear_delts','rhomboids'], ARRAY['traps','rotator_cuff'], 'isolation', 'cable', 'A la poulie haute avec corde. Tirez vers le visage en ecartant les mains. Serrez les omoplates.', 'Excellent pour la sante des epaules et la posture.', 'beginner', true),
  ('Plank', 'Gainage', ARRAY['core'], ARRAY['shoulders','glutes'], 'isolation', 'bodyweight', 'En appui sur les avant-bras et les orteils. Maintenez le corps droit comme une planche.', 'Contractez les abdos et les fessiers. Ne laissez pas les hanches s''affaisser.', 'beginner', true),
  ('Cable Fly', 'Ecarte poulie', ARRAY['chest'], ARRAY['front_delts'], 'isolation', 'cable', 'Debout entre deux poulies. Ramenez les mains devant vous en arc de cercle.', 'Gardez une legere flexion des coudes. Controlez le mouvement.', 'beginner', true),
  ('Hack Squat', 'Hack squat', ARRAY['quadriceps'], ARRAY['glutes','hamstrings'], 'compound', 'machine', 'Placez-vous dans la machine hack squat. Descendez en pliant les genoux, puis remontez.', 'Permet de cibler les quadriceps en toute securite.', 'beginner', true),
  ('Hip Thrust', 'Hip thrust', ARRAY['glutes'], ARRAY['hamstrings','core'], 'compound', 'barbell', 'Dos appuye sur un banc, barre sur les hanches. Poussez les hanches vers le haut en contractant les fessiers.', 'Faites une pause en haut du mouvement. Gardez le menton rentre.', 'beginner', true),
  ('Calf Raise', 'Mollets', ARRAY['calves'], ARRAY[]::text[], 'isolation', 'machine', 'Debout sur la pointe des pieds. Montez et descendez lentement en controlant le mouvement.', 'Etirez bien en bas et contractez en haut. Faites des repetitions lentes.', 'beginner', true),
  ('Shrug', 'Haussement d''epaules', ARRAY['traps'], ARRAY[]::text[], 'isolation', 'barbell', 'Debout, barre en mains. Montez les epaules vers les oreilles puis redescendez.', 'Ne roulez pas les epaules. Mouvement vertical uniquement.', 'beginner', true),
  ('Farmer Walk', 'Marche du fermier', ARRAY['forearms','traps','core'], ARRAY['shoulders','glutes'], 'compound', 'dumbbell', 'Saisissez un poids lourd dans chaque main et marchez droit avec une posture parfaite.', 'Gardez les epaules en arriere et le dos droit. Excellent pour le grip et le core.', 'beginner', true)
ON CONFLICT (name) DO NOTHING;
