export type Lang = 'he' | 'en';

export const LANGS: Lang[] = ['he', 'en'];

/**
 * Every user-facing string in the app, keyed by a dotted path.
 * Look-ups go through I18nService.t(); a missing key falls back to the key
 * itself so gaps are obvious in the UI rather than silently blank.
 */
export const TRANSLATIONS: Record<Lang, Record<string, string>> = {
  he: {
    // Login — branding panel
    'login.headline.line1': 'תכנן את העבודה.',
    'login.headline.line2.before': 'ואז ',
    'login.headline.line2.em': 'בצע',
    'login.headline.line2.after': ' אותה.',
    'login.brandSubtitle':
      'פלטפורמת ניהול המשימות שמסדרת את העבודה לשלבים ברורים — כדי שתוכל להתמקד במה שחשוב.',
    'login.footer': '© Stack 2026 · פרטיות · תנאים',

    // Login — form panel
    'login.title': 'ברוך שובך',
    'login.subtitle': 'התחבר למרחב העבודה שלך.',
    'login.email': 'דוא"ל',
    'login.email.required': 'יש להזין כתובת דוא"ל',
    'login.email.invalid': 'כתובת הדוא"ל אינה תקינה',
    'login.password': 'סיסמה',
    'login.password.required': 'יש להזין סיסמה',
    'login.password.toggle': 'הצג/הסתר סיסמה',
    'login.error': 'פרטי ההתחברות שגויים',
    'login.submit': '→ התחברות',
    'login.submitting': 'מתחבר...',

    // Header
    'header.title': 'לוח',
    'header.subtitle': 'משימות ב-3 עמודות',
    'header.newTask': '+ משימה חדשה',
    'header.logout': 'התנתק',
    'header.theme.toLight': 'עבור למצב בהיר',
    'header.theme.toDark': 'עבור למצב כהה',

    // Board toolbar
    'board.priority': 'עדיפות',
    'board.filter.all': 'הכל',
    'board.search': 'חיפוש משימות...',

    // Statuses
    'status.todo': 'לעשות',
    'status.in-progress': 'בתהליך',
    'status.done': 'הושלם',

    // Priorities
    'priority.high': 'גבוהה',
    'priority.medium': 'בינונית',
    'priority.low': 'נמוכה',

    // Kanban column
    'column.empty': 'אין משימות',
    'column.add': 'הוסף משימה',

    // Task card
    'card.edit': 'ערוך משימה',
    'card.delete': 'מחק משימה',
    'card.deleteConfirm': 'למחוק?',

    // Task dialog
    'dialog.title.create': 'משימה חדשה',
    'dialog.title.edit': 'עריכת משימה',
    'dialog.close': 'סגור',
    'dialog.field.title': 'כותרת',
    'dialog.field.title.placeholder': 'שם המשימה',
    'dialog.field.title.required': 'יש להזין כותרת',
    'dialog.field.description': 'תיאור · אופציונלי',
    'dialog.field.description.placeholder': 'תיאור המשימה...',
    'dialog.field.status': 'סטטוס',
    'dialog.field.priority': 'עדיפות',
    'dialog.cancel': 'ביטול',
    'dialog.submit.create': 'צור משימה',
    'dialog.submit.edit': 'שמור שינויים',
    'dialog.submitting.create': 'יוצר...',
    'dialog.submitting.edit': 'שומר...',

    // Errors (emitted as keys by services)
    'errors.loadTasks': 'שגיאה בטעינת המשימות',

    // Accessibility
    'a11y.switchLang': 'החלף שפה',
  },

  en: {
    // Login — branding panel
    'login.headline.line1': 'Plan the work.',
    'login.headline.line2.before': 'Then ',
    'login.headline.line2.em': 'do',
    'login.headline.line2.after': ' it.',
    'login.brandSubtitle':
      'The task management platform that breaks work into clear stages — so you can focus on what matters.',
    'login.footer': '© Stack 2026 · Privacy · Terms',

    // Login — form panel
    'login.title': 'Welcome back',
    'login.subtitle': 'Sign in to your workspace.',
    'login.email': 'Email',
    'login.email.required': 'Please enter an email address',
    'login.email.invalid': 'The email address is invalid',
    'login.password': 'Password',
    'login.password.required': 'Please enter a password',
    'login.password.toggle': 'Show/hide password',
    'login.error': 'Incorrect login details',
    'login.submit': '→ Sign in',
    'login.submitting': 'Signing in...',

    // Header
    'header.title': 'Board',
    'header.subtitle': 'tasks across 3 columns',
    'header.newTask': '+ New task',
    'header.logout': 'Log out',
    'header.theme.toLight': 'Switch to light mode',
    'header.theme.toDark': 'Switch to dark mode',

    // Board toolbar
    'board.priority': 'Priority',
    'board.filter.all': 'All',
    'board.search': 'Search tasks...',

    // Statuses
    'status.todo': 'To do',
    'status.in-progress': 'In progress',
    'status.done': 'Done',

    // Priorities
    'priority.high': 'High',
    'priority.medium': 'Medium',
    'priority.low': 'Low',

    // Kanban column
    'column.empty': 'No tasks',
    'column.add': 'Add task',

    // Task card
    'card.edit': 'Edit task',
    'card.delete': 'Delete task',
    'card.deleteConfirm': 'Delete?',

    // Task dialog
    'dialog.title.create': 'New task',
    'dialog.title.edit': 'Edit task',
    'dialog.close': 'Close',
    'dialog.field.title': 'Title',
    'dialog.field.title.placeholder': 'Task name',
    'dialog.field.title.required': 'Please enter a title',
    'dialog.field.description': 'Description · optional',
    'dialog.field.description.placeholder': 'Task description...',
    'dialog.field.status': 'Status',
    'dialog.field.priority': 'Priority',
    'dialog.cancel': 'Cancel',
    'dialog.submit.create': 'Create task',
    'dialog.submit.edit': 'Save changes',
    'dialog.submitting.create': 'Creating...',
    'dialog.submitting.edit': 'Saving...',

    // Errors (emitted as keys by services)
    'errors.loadTasks': 'Failed to load tasks',

    // Accessibility
    'a11y.switchLang': 'Switch language',
  },
};
