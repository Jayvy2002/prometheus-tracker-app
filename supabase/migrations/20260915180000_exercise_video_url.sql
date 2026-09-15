-- Lot 11 (UX86): execution video on the shared exercise catalogue.
-- New version only. Do not restamp history.

ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS video_url text;

COMMENT ON COLUMN public.exercises.video_url IS
  'Public execution demo (YouTube watch URL or direct mp4). Shown in picker and session card.';

UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=rT7DgCr-3pg' WHERE name = 'Bench Press' AND video_url IS NULL;
UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=ultWZbUMPL8' WHERE name = 'Squat' AND video_url IS NULL;
UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=op9kVnSso6Q' WHERE name = 'Deadlift' AND video_url IS NULL;
UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=2yjwXTZQDDI' WHERE name = 'Overhead Press' AND video_url IS NULL;
UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=FWJR5Ve8bnQ' WHERE name = 'Barbell Row' AND video_url IS NULL;
UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=eGo4IYlbE5g' WHERE name = 'Pull-up' AND video_url IS NULL;
UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=brhR3BSSG1Y' WHERE name = 'Chin-up' AND video_url IS NULL;
UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=2z8JmcrW-As' WHERE name = 'Dip' AND video_url IS NULL;
UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=CAwf7n6Luuc' WHERE name = 'Lat Pulldown' AND video_url IS NULL;
UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=GZbfZ033f74' WHERE name = 'Cable Row' AND video_url IS NULL;
UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=SrqOu55g76E' WHERE name = 'Incline Bench Press' AND video_url IS NULL;
UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=LfyQBUKRUP4' WHERE name = 'Decline Bench Press' AND video_url IS NULL;
UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=VmB1G1K7v94' WHERE name = 'Dumbbell Press' AND video_url IS NULL;
UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=eozdVDA78K0' WHERE name = 'Dumbbell Fly' AND video_url IS NULL;
UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=IZhtHueyPdk' WHERE name = 'Leg Press' AND video_url IS NULL;
UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=YF5FAnirZBg' WHERE name = 'Leg Extension' AND video_url IS NULL;
UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=1Tq3QdYUuHs' WHERE name = 'Leg Curl' AND video_url IS NULL;
UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=jEy_czb3RKA' WHERE name = 'Romanian Deadlift' AND video_url IS NULL;
UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=2C-uNTzq7bU' WHERE name = 'Bulgarian Split Squat' AND video_url IS NULL;
UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=QOVaHwm-Q6U' WHERE name = 'Lunge' AND video_url IS NULL;
UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=ykJmrZ5v0Oo' WHERE name = 'Bicep Curl' AND video_url IS NULL;
UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=YbX7Wd8jQ-Q' WHERE name = 'Tricep Extension' AND video_url IS NULL;
UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=3VcKaXpzqRo' WHERE name = 'Lateral Raise' AND video_url IS NULL;
UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=rep-xVJkZFc' WHERE name = 'Face Pull' AND video_url IS NULL;
UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=ASdvN_XkbMY' WHERE name = 'Plank' AND video_url IS NULL;
UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=Iwe6AmxVf7o' WHERE name = 'Cable Fly' AND video_url IS NULL;
UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=0tn5K9NlCfo' WHERE name = 'Hack Squat' AND video_url IS NULL;
UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=LM8XHLYJBCs' WHERE name = 'Hip Thrust' AND video_url IS NULL;
UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=gwLzqxqQKPc' WHERE name = 'Calf Raise' AND video_url IS NULL;
UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=g6qbq86TrxI' WHERE name = 'Shrug' AND video_url IS NULL;
UPDATE public.exercises SET video_url = 'https://www.youtube.com/watch?v=Fkzk_RqlYfA' WHERE name = 'Farmer Walk' AND video_url IS NULL;
