# Droply — Today's Development Summary 💧

19 November 2026 · Website, Supabase, Admin Panel & Support System

Today, we turned Droply's website into much more than a download page. We built the foundation for a complete **website, newsletter, customer contact, and support management system**.

## 1. Website improvements

**Updated the Droply website**

- Maintained the electric-blue and yellow design.
- Added working macOS and Windows v2.8.2 download links.
- Updated the app preview to match the real Droply desktop interface.
- Preserved existing animations and mobile responsiveness.
- Added Contact us, newsletter, and Get help features.

## 2. Newsletter system

**Connected the newsletter to Supabase**

- Created a secure subscriber database.
- Connected the signup form directly to Supabase.
- Removed the unnecessary confirmation checkbox.
- Made signup a simple email field and **Sign up** button.
- Added server-side validation, rate limiting, and a privacy notice.

## 3. Contact us system

**Created an in-house contact form**

- Visitors can send messages without opening an email application.
- Added a themed pop-up with name, email, and message fields.
- Stored submissions in a private Supabase database.
- Added spam protection and server-side validation.
- Fixed the alignment of the pop-up's close button.

## 4. Private admin panel

**Built an administrator-only inbox**

- Created two accounts: `anil` and `cenk`.
- Added server-side password verification and expiring sessions.
- Built a dashboard matching Droply's branding.
- Added message search and status filters.
- Added **New**, **Read**, and **Resolved** message states.
- Fixed the admin panel initially displaying raw HTML.

## 5. Resolution notes

**Improved the admin review workflow**

Clicking **Resolve** now opens a note box. The administrator must explain how the issue was handled before saving.

Supabase records the note, the administrator who resolved the issue, and the resolution timestamp.

## 6. Chatbot and support tickets

**Added the Get help chatbot**

- Added a floating Get help button.
- Created a troubleshooting guide for common Droply issues.
- Added quick help topics.
- Created a separate support ticket database.
- Added **Support ticket requests** as a second admin panel tab.
- Enabled ticket reviewing and resolution notes.

## 7. Removed the paid AI requirement

Originally, the chatbot required an OpenAI API key. We replaced this with a **free, rules-based troubleshooting guide**.

| | |
|---|---|
| **15/15** | Guide tests passed |
| **$0** | AI token charges |
| **2** | Admin inbox sections |

Normal Supabase hosting limits still apply.

## Current project status

| Component | Status |
|---|---|
| Droply marketing website | Updated |
| macOS / Windows download links | Configured |
| Newsletter database | Connected |
| Contact messaging | Deployed |
| Admin authentication | Deployed |
| Resolution notes | Deployed |
| Support ticket database | Deployed |
| Free support chatbot | Deployed |
| Complete live browser testing | Still needed |

The code and database checks passed, but a full live test of the published website's forms, chatbot, and admin login is still outstanding.

