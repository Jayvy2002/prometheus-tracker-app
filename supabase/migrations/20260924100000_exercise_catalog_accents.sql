-- Catalogue d'exercices : accents français (audit 2, finitions).
-- Le seed 20260824233544 a écrit les noms, consignes et conseils français sans
-- accents (« Developpe couche »). Cette migration corrige le texte affiché sans
-- toucher l'identité : l'id, le nom anglais et la forme normalisée des alias
-- (qui ignore déjà les accents) restent les mêmes, donc séances, routines,
-- programmes et records gardent leurs liens.
--
-- Chaque colonne n'est corrigée que si elle contient encore exactement le texte
-- du seed sans accents : une correction faite depuis (admin, fusion) est gardée.

WITH f(name, name_fr, instructions, tips) AS (
  VALUES
  ('Bench Press', 'Développé couché', 'Allongez-vous sur le banc, pieds au sol. Saisissez la barre légèrement plus large que les épaules. Descendez la barre vers le milieu de la poitrine, puis poussez vers le haut.', 'Gardez les omoplates serrées. Ne rebondissez pas la barre sur la poitrine.'),
  ('Squat', 'Squat', 'Placez la barre sur les trapèzes. Descendez en pliant les genoux et les hanches comme pour vous asseoir. Descendez jusqu''à ce que les cuisses soient parallèles au sol.', 'Gardez le dos droit et les genoux dans l''axe des pieds. Poussez à travers les talons.'),
  ('Deadlift', 'Soulevé de terre', 'Pieds à largeur des hanches, saisissez la barre. Poussez avec les jambes tout en gardant le dos droit pour soulever la barre le long du corps.', 'Ne jamais arrondir le dos. La barre doit rester proche du corps.'),
  ('Overhead Press', 'Développé militaire', 'Debout, saisissez la barre au niveau des épaules. Poussez la barre au-dessus de la tête jusqu''à extension complète des bras.', 'Contractez les fessiers et les abdos pour la stabilité. Évitez de cambrer excessivement.'),
  ('Barbell Row', 'Rowing barre', 'Penchez-vous en avant avec le dos droit. Tirez la barre vers le nombril en serrant les omoplates.', 'Gardez le buste incliné à ~45 degrés. Ne tirez pas avec le bas du dos.'),
  ('Pull-up', 'Traction', 'Saisissez la barre en pronation. Tirez-vous vers le haut jusqu''à ce que le menton dépasse la barre.', 'Initiez le mouvement en tirant les coudes vers le bas. Évitez le balancement.'),
  ('Chin-up', 'Traction supination', 'Saisissez la barre en supination (paumes vers vous). Tirez-vous vers le haut.', 'Plus facile que les tractions classiques. Excellent pour les biceps.'),
  ('Dip', 'Dips', 'Saisissez les barres parallèles. Descendez en pliant les coudes, puis poussez vers le haut.', 'Penchez-vous en avant pour cibler la poitrine, restez droit pour les triceps.'),
  ('Lat Pulldown', 'Tirage vertical', 'Asseyez-vous face à la machine. Tirez la barre vers le haut de la poitrine en serrant les omoplates.', 'Ne tirez pas derrière la nuque. Gardez le buste légèrement incliné en arrière.'),
  ('Cable Row', 'Tirage horizontal', 'Asseyez-vous face à la poulie basse. Tirez la poignée vers le nombril en serrant les omoplates.', 'Gardez le dos droit. Ne vous balancez pas en arrière.'),
  ('Incline Bench Press', 'Développé incliné', 'Allongez-vous sur un banc incliné à 30-45 degrés. Descendez la barre vers le haut de la poitrine, puis poussez.', 'L''angle idéal est entre 30 et 45 degrés pour cibler le haut des pectoraux.'),
  ('Decline Bench Press', 'Développé décliné', 'Allongez-vous sur un banc décliné. Descendez la barre vers le bas de la poitrine.', 'Cible le bas des pectoraux. Attention à la pression sanguine en position déclinée.'),
  ('Dumbbell Press', 'Développé haltères', 'Allongez-vous avec un haltère dans chaque main. Poussez les haltères vers le haut, puis redescendez lentement.', 'Les haltères permettent une plus grande amplitude qu''à la barre.'),
  ('Dumbbell Fly', 'Écarté haltères', 'Allongez-vous avec les bras tendus au-dessus de la poitrine. Ouvrez les bras en arc de cercle, puis revenez.', 'Gardez une légère flexion des coudes. Ne descendez pas trop bas.'),
  ('Leg Press', 'Presse à cuisses', 'Asseyez-vous dans la machine. Poussez la plateforme avec les pieds jusqu''à extension des jambes.', 'Ne verrouillez pas les genoux en extension. Gardez le dos bien plaqué.'),
  ('Leg Extension', 'Extension des jambes', 'Asseyez-vous dans la machine. Étendez les jambes en contractant les quadriceps.', 'Mouvement lent et contrôlé. Idéal en finition ou en pré-fatigue.'),
  ('Leg Curl', 'Curl jambes', 'Allongez-vous face contre le banc. Fléchissez les jambes en contractant les ischio-jambiers.', 'Ne laissez pas les hanches se soulever du banc.'),
  ('Romanian Deadlift', 'Soulevé de terre roumain', 'Debout avec la barre. Descendez en poussant les hanches en arrière, jambes presque tendues.', 'Gardez la barre proche des jambes. Ressentez l''étirement des ischio-jambiers.'),
  ('Bulgarian Split Squat', 'Squat bulgare', 'Un pied devant, l''autre sur un banc derrière. Descendez en pliant le genou avant.', 'Gardez le buste droit. Le genou avant ne dépasse pas les orteils.'),
  ('Lunge', 'Fente', 'Faites un grand pas en avant et descendez le genou arrière vers le sol. Revenez à la position initiale.', 'Gardez le buste droit. Alternez les jambes.'),
  ('Bicep Curl', 'Curl biceps', 'Debout, bras le long du corps. Fléchissez les coudes pour monter les haltères vers les épaules.', 'Ne balancez pas le corps. Gardez les coudes fixes.'),
  ('Tricep Extension', 'Extension triceps', 'Un haltère tenu à deux mains au-dessus de la tête. Descendez derrière la tête en fléchissant les coudes.', 'Gardez les coudes proches de la tête et fixes.'),
  ('Lateral Raise', 'Élévation latérale', 'Debout, bras le long du corps. Levez les bras sur les côtés jusqu''à hauteur des épaules.', 'Gardez une légère flexion des coudes. Contrôle la descente.'),
  ('Face Pull', 'Face pull', 'À la poulie haute avec corde. Tirez vers le visage en écartant les mains. Serrez les omoplates.', 'Excellent pour la santé des épaules et la posture.'),
  ('Plank', 'Gainage', 'En appui sur les avant-bras et les orteils. Maintenez le corps droit comme une planche.', 'Contractez les abdos et les fessiers. Ne laissez pas les hanches s''affaisser.'),
  ('Cable Fly', 'Écarté poulie', 'Debout entre deux poulies. Ramenez les mains devant vous en arc de cercle.', 'Gardez une légère flexion des coudes. Contrôlez le mouvement.'),
  ('Hack Squat', 'Hack squat', 'Placez-vous dans la machine hack squat. Descendez en pliant les genoux, puis remontez.', 'Permet de cibler les quadriceps en toute sécurité.'),
  ('Hip Thrust', 'Hip thrust', 'Dos appuyé sur un banc, barre sur les hanches. Poussez les hanches vers le haut en contractant les fessiers.', 'Faites une pause en haut du mouvement. Gardez le menton rentré.'),
  ('Calf Raise', 'Mollets', 'Debout sur la pointe des pieds. Montez et descendez lentement en contrôlant le mouvement.', 'Étirez bien en bas et contractez en haut. Faites des répétitions lentes.'),
  ('Shrug', 'Haussement d''épaules', 'Debout, barre en mains. Montez les épaules vers les oreilles puis redescendez.', 'Ne roulez pas les épaules. Mouvement vertical uniquement.'),
  ('Farmer Walk', 'Marche du fermier', 'Saisissez un poids lourd dans chaque main et marchez droit avec une posture parfaite.', 'Gardez les épaules en arrière et le dos droit. Excellent pour le grip et le core.')
), fixed AS (
  UPDATE public.exercises e
     SET name_fr = CASE WHEN e.name_fr = translate(f.name_fr, 'àâäçéèêëîïôöùûüÀÂÉÈÊÇÔ', 'aaaceeeeiioouuuAAEEECO') THEN f.name_fr ELSE e.name_fr END,
         instructions = CASE WHEN e.instructions = translate(f.instructions, 'àâäçéèêëîïôöùûüÀÂÉÈÊÇÔ', 'aaaceeeeiioouuuAAEEECO') THEN f.instructions ELSE e.instructions END,
         tips = CASE WHEN e.tips = translate(f.tips, 'àâäçéèêëîïôöùûüÀÂÉÈÊÇÔ', 'aaaceeeeiioouuuAAEEECO') THEN f.tips ELSE e.tips END
    FROM f
   WHERE e.name = f.name
     AND e.created_by IS NULL
  RETURNING e.id
)
-- The French canonical alias shows the same text; its normalized key is unchanged.
UPDATE public.exercise_aliases a
   SET alias = f.name_fr
  FROM f
  JOIN public.exercises e ON e.name = f.name
 WHERE a.exercise_id = e.id
   AND a.locale = 'fr'
   AND a.source = 'canonical'
   AND a.alias = translate(f.name_fr, 'àâäçéèêëîïôöùûüÀÂÉÈÊÇÔ', 'aaaceeeeiioouuuAAEEECO');
