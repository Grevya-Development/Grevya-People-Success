-- Deepavali 2026 falls on Sunday, 8 November (it was seeded as 10 November).
update public.holidays
   set date = '2026-11-08'
 where name = 'Deepavali' and date = '2026-11-10';

update public.announcements
   set title = 'Deepavali on 8 November',
       body  = 'Deepavali falls on Sunday, 8 November. Wishing you and your family a joyful festival of lights!'
 where title = 'Deepavali holiday on 10 November';
