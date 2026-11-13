BEGIN;

-- Update only untouched defaults. Preserve edited, renamed, retyped, and deleted labels.
UPDATE memory_labels AS label
SET description = revised.description
FROM (VALUES
  ('Project', 'For this board, Project includes a specific planned or ongoing undertaking, its goals, progress, or implementation; general observations about work alone do not qualify.', 'Personal projects the owner wants to build, is building, or maintains, mainly websites, web apps, and other software. Includes project ideas, planning, implementation, and progress. Employer projects and generic development advice alone do not qualify.'),
  ('Job', 'For this board, Job includes work, careers, professional roles, and approaches to doing good work; it is not limited to job searching or employment changes.', 'The owner''s employment, employer, and work as an employed software engineer: company matters, team collaboration, professional responsibilities, and practices for doing that job well. General software topics without a work context do not qualify.'),
  ('Web development', 'For this board, Web development includes creating, maintaining, or deploying websites and web applications', 'Creating, maintaining, or deploying websites and web applications: frontend, backend, browser APIs, web frameworks, styling, and web architecture. Applies to personal projects, employed work, and general web development knowledge.'),
  ('Personal development', 'For this board, Personal development includes growth in skills, attitudes, mindset, self-improvement, and curiosity; it is not limited to formal training.', 'Deliberate self-improvement: things the owner can do better in life, including habits, mindset, communication, curiosity, and developing personal skills. Includes ways to improve at work when self-improvement is central. Building software, planning a personal project, technical facts, or routine tasks alone do not qualify unless the memory is about improving the owner''s own abilities or behavior.')
) AS revised(name, previous_description, description)
WHERE label.name = revised.name
  AND label.kind = 'tag'
  AND label.description = revised.previous_description;

COMMIT;
