## 2024-05-19 - Dashboard Reminders Screen Reader Accessibility
**Learning:** Found an accessibility issue pattern where dynamic pop-up reminder items (like deload, weight, meal, water) were using icon-only buttons for dismissals without ARIA labels, rendering them inaccessible to screen reader users who could only hear the adjacent text.
**Action:** When adding new dismissible alerts or reminders with icon-only buttons, always ensure to use `aria-label={t('common.dismiss')}` or a similar appropriate i18n label to provide context to screen readers.
