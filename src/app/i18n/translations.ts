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

    // Auth — shared across login / register / reset
    'auth.or': 'או',
    'auth.google': 'המשך עם Google',
    'auth.magicLink': 'שלחו לי קישור כניסה',
    'auth.magicLink.sent': 'שלחנו קישור כניסה לכתובת הדוא"ל שלך.',
    'auth.forgotPassword': 'שכחת סיסמה?',
    'auth.reset.sent': 'שלחנו קישור לאיפוס הסיסמה לכתובת הדוא"ל שלך.',
    'auth.error.generic': 'משהו השתבש. נסו שוב.',
    'auth.noAccount': 'אין לך חשבון?',
    'auth.haveAccount': 'כבר יש לך חשבון?',
    'auth.register': 'הרשמה',
    'auth.signIn': 'התחברות',
    'auth.callback.working': 'מתחברים...',
    'auth.callback.failed': 'ההתחברות נכשלה. נסו שוב.',

    // Register
    'register.title': 'יצירת חשבון',
    'register.subtitle': 'התחילו לתכנן את העבודה שלכם.',
    'register.name': 'שם מלא',
    'register.name.required': 'יש להזין שם',
    'register.submit': '→ הרשמה',
    'register.submitting': 'יוצר חשבון...',
    'register.error': 'לא ניתן ליצור חשבון. ייתכן שכתובת הדוא"ל כבר רשומה.',
    'register.error.exists': 'כתובת הדוא"ל כבר רשומה במערכת.',
    'register.error.invalidEmail': 'כתובת הדוא"ל אינה תקינה.',
    'register.error.rateLimit': 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.',
    'register.error.weakPassword': 'הסיסמה חייבת לכלול לפחות 6 תווים.',
    'register.checkEmail': 'כמעט סיימנו — אשרו את כתובת הדוא"ל שלכם דרך הקישור ששלחנו.',

    // Reset password
    'reset.title': 'בחירת סיסמה חדשה',
    'reset.password': 'סיסמה חדשה',
    'reset.password.required': 'יש להזין סיסמה',
    'reset.password.minlength': 'הסיסמה חייבת לכלול לפחות 6 תווים',
    'reset.submit': 'עדכון סיסמה',
    'reset.submitting': 'מעדכן...',
    'reset.error': 'לא ניתן לעדכן את הסיסמה. נסו לשלוח קישור חדש.',

    // Header
    'header.title': 'לוח',
    'header.subtitle': 'משימות ב-3 עמודות',
    'header.newTask': '+ משימה חדשה',
    'header.logout': 'התנתק',
    'header.theme.toLight': 'עבור למצב בהיר',
    'header.theme.toDark': 'עבור למצב כהה',

    // User menu (avatar dropdown)
    'menu.language': 'שפה',
    'menu.language.he': 'עברית',
    'menu.language.en': 'English',
    'menu.theme': 'ערכת נושא',
    'menu.theme.light': 'בהיר',
    'menu.theme.dark': 'כהה',
    'menu.logout': 'התנתק',
    'menu.open': 'פתח את תפריט המשתמש',

    // Board toolbar
    'board.priority': 'עדיפות',
    'board.filter.all': 'הכל',
    'board.assignee': 'אחראי',
    'board.assignee.all': 'כל המשימות',
    'board.assignee.me': 'המשימות שלי',
    'board.search': 'חיפוש משימות...',
    'board.rename': 'שנה שם ללוח',
    'board.name.placeholder': 'שם הלוח',

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
    'card.deleteError': 'המחיקה נכשלה',
    'card.drag': 'גרור לשינוי סדר',
    'card.dueDate.aria': 'תאריך יעד: {date} ({label})',
    'card.assignee.aria': 'אחראי: {name}',

    // Due-date badge labels
    'due.today': 'היום',
    'due.tomorrow': 'מחר',
    'due.yesterday': 'אתמול',
    'due.inDays': 'בעוד {n} ימים',
    'due.overdueDays': 'באיחור של {n} ימים',
    'due.inDaysDual': 'בעוד יומיים',
    'due.overdueDaysDual': 'לפני יומיים',

    // Task dialog
    'dialog.title.create': 'משימה חדשה',
    'dialog.title.edit': 'עריכת משימה',
    'dialog.close': 'סגור',
    'dialog.field.title': 'כותרת',
    'dialog.field.title.placeholder': 'שם המשימה',
    'dialog.field.title.required': 'יש להזין כותרת',
    'dialog.field.description': 'תיאור · אופציונלי',
    'dialog.field.description.placeholder': 'תיאור המשימה...',
    'dialog.field.dueDate': 'תאריך יעד · אופציונלי',
    'dialog.field.dueDate.clear': 'נקה תאריך יעד',
    'dialog.field.status': 'סטטוס',
    'dialog.field.assignee': 'אחראי · אופציונלי',
    'dialog.field.assignee.unassigned': 'ללא אחראי',
    'dialog.field.assignee.memberHint': 'רק בעלים יכול לשייך משימות לחברים אחרים.',
    'dialog.field.priority': 'עדיפות',
    'dialog.cancel': 'ביטול',
    'dialog.submit.create': 'צור משימה',
    'dialog.submit.edit': 'שמור שינויים',
    'dialog.submitting.create': 'יוצר...',
    'dialog.submitting.edit': 'שומר...',
    'dialog.error.save': 'לא ניתן לשמור את המשימה. נסו שוב.',

    // Teams
    'team.switch': 'החלף צוות',
    'team.switcher.current': 'צוות נוכחי',
    'team.role.owner': 'בעלים',
    'team.role.member': 'חבר',
    'team.new': '＋ צוות חדש',
    'team.manage': 'ניהול צוות',
    'team.create.title': 'צוות חדש',
    'team.create.name': 'שם הצוות',
    'team.create.name.placeholder': 'למשל: שיווק',
    'team.create.name.required': 'יש להזין שם צוות',
    'team.create.submit': 'צור צוות',
    'team.create.submitting': 'יוצר...',
    'team.create.error': 'יצירת הצוות נכשלה. נסו שוב.',

    // Team panel (Pass B)
    'teamPanel.title': 'ניהול צוות',
    'teamPanel.members': 'חברי צוות',
    'teamPanel.you': 'אני',
    'teamPanel.member.remove': 'הסר',
    'teamPanel.member.removeConfirm': 'להסיר?',
    'teamPanel.invite': 'הזמנת חברים',
    'teamPanel.invite.email.placeholder': 'כתובת דוא"ל',
    'teamPanel.invite.email.invalid': 'כתובת הדוא"ל אינה תקינה',
    'teamPanel.invite.send': 'שלח הזמנה',
    'teamPanel.invite.sent': 'הזמנה נשלחה במייל',
    'teamPanel.invite.hint': 'נשלח קישור הצטרפות במייל. הנמען חייב חשבון קיים ב-Stack.',
    'teamPanel.invite.pending': 'ממתין',
    'teamPanel.invite.error.noAccount': 'אין חשבון עם הכתובת הזו',
    'teamPanel.invite.error.alreadyMember': 'המשתמש כבר חבר בצוות',
    'teamPanel.invite.error.emailFailed':
      'ההזמנה נוצרה אך שליחת המייל נכשלה — העתיקו את הקישור למטה.',
    'teamPanel.invite.email.alreadyInvited': 'כבר נשלחה הזמנה לכתובת הזו.',
    'teamPanel.link.label': 'קישור הזמנה',
    'teamPanel.link.create': 'צור קישור הזמנה משותף',
    'teamPanel.link.copy': 'העתק',
    'teamPanel.link.copied': 'הועתק',
    'teamPanel.link.revoke': 'בטל',
    'teamPanel.leave': 'עזוב צוות',
    'teamPanel.delete': 'מחק צוות',
    'teamPanel.delete.confirm': 'למחוק לצמיתות?',
    'teamPanel.error.generic': 'משהו השתבש. נסו שוב.',
    'teamPanel.error.notOwner': 'רק בעלים יכול להזמין חברים',
    'teamPanel.error.copy': 'לא ניתן להעתיק את הקישור',

    // Invite accept page (Pass B)
    'invite.working': 'מצרפים אותך לצוות...',
    'invite.toBoard': 'המשך ללוח',
    'invite.error.generic': 'לא ניתן לצרף אותך לצוות.',
    'invite.error.notFound': 'ההזמנה לא נמצאה.',
    'invite.error.used': 'ההזמנה כבר נוצלה.',
    'invite.error.expired': 'תוקף ההזמנה פג.',
    'invite.wrongAccount': 'ההזמנה נשלחה לכתובת דוא"ל אחרת',

    // Errors (emitted as keys by services)
    'errors.loadTasks': 'שגיאה בטעינת המשימות',
    'errors.loadTeams': 'שגיאה בטעינת הצוותים',
    'errors.switchTeam': 'לא ניתן להחליף צוות',
    'errors.renameTeam': 'שינוי שם הצוות נכשל',
    'errors.lastTeam': 'לא ניתן לעזוב את הצוות האחרון שלך',

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

    // Auth — shared across login / register / reset
    'auth.or': 'or',
    'auth.google': 'Continue with Google',
    'auth.magicLink': 'Email me a login link',
    'auth.magicLink.sent': "We've emailed you a login link.",
    'auth.forgotPassword': 'Forgot password?',
    'auth.reset.sent': "We've emailed you a password reset link.",
    'auth.error.generic': 'Something went wrong. Please try again.',
    'auth.noAccount': "Don't have an account?",
    'auth.haveAccount': 'Already have an account?',
    'auth.register': 'Sign up',
    'auth.signIn': 'Sign in',
    'auth.callback.working': 'Signing you in...',
    'auth.callback.failed': 'Sign-in failed. Please try again.',

    // Register
    'register.title': 'Create your account',
    'register.subtitle': 'Start planning your work.',
    'register.name': 'Full name',
    'register.name.required': 'Please enter your name',
    'register.submit': '→ Sign up',
    'register.submitting': 'Creating account...',
    'register.error': "Couldn't create the account. The email may already be registered.",
    'register.error.exists': 'That email is already registered.',
    'register.error.invalidEmail': 'That email address is invalid.',
    'register.error.rateLimit': 'Too many attempts. Please try again later.',
    'register.error.weakPassword': 'Password must be at least 6 characters.',
    'register.checkEmail': 'Almost there — confirm your email via the link we just sent.',

    // Reset password
    'reset.title': 'Choose a new password',
    'reset.password': 'New password',
    'reset.password.required': 'Please enter a password',
    'reset.password.minlength': 'Password must be at least 6 characters',
    'reset.submit': 'Update password',
    'reset.submitting': 'Updating...',
    'reset.error': "Couldn't update the password. Try requesting a new link.",

    // Header
    'header.title': 'Board',
    'header.subtitle': 'tasks across 3 columns',
    'header.newTask': '+ New task',
    'header.logout': 'Log out',
    'header.theme.toLight': 'Switch to light mode',
    'header.theme.toDark': 'Switch to dark mode',

    // User menu (avatar dropdown)
    'menu.language': 'Language',
    'menu.language.he': 'עברית',
    'menu.language.en': 'English',
    'menu.theme': 'Theme',
    'menu.theme.light': 'Light',
    'menu.theme.dark': 'Dark',
    'menu.logout': 'Log out',
    'menu.open': 'Open user menu',

    // Board toolbar
    'board.priority': 'Priority',
    'board.filter.all': 'All',
    'board.assignee': 'Assignee',
    'board.assignee.all': 'All tasks',
    'board.assignee.me': 'Assigned to me',
    'board.search': 'Search tasks...',
    'board.rename': 'Rename board',
    'board.name.placeholder': 'Board name',

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
    'card.deleteError': 'Delete failed',
    'card.drag': 'Drag to reorder',
    'card.dueDate.aria': 'Due date: {date} ({label})',
    'card.assignee.aria': 'Assignee: {name}',

    // Due-date badge labels
    'due.today': 'today',
    'due.tomorrow': 'tomorrow',
    'due.yesterday': 'yesterday',
    'due.inDays': 'in {n} days',
    'due.overdueDays': '{n} days overdue',
    'due.inDaysDual': 'in 2 days',
    'due.overdueDaysDual': '2 days overdue',

    // Task dialog
    'dialog.title.create': 'New task',
    'dialog.title.edit': 'Edit task',
    'dialog.close': 'Close',
    'dialog.field.title': 'Title',
    'dialog.field.title.placeholder': 'Task name',
    'dialog.field.title.required': 'Please enter a title',
    'dialog.field.description': 'Description · optional',
    'dialog.field.description.placeholder': 'Task description...',
    'dialog.field.dueDate': 'Due date · optional',
    'dialog.field.dueDate.clear': 'Clear due date',
    'dialog.field.status': 'Status',
    'dialog.field.assignee': 'Assignee · optional',
    'dialog.field.assignee.unassigned': 'Unassigned',
    'dialog.field.assignee.memberHint': 'Only an owner can assign tasks to other members.',
    'dialog.field.priority': 'Priority',
    'dialog.cancel': 'Cancel',
    'dialog.submit.create': 'Create task',
    'dialog.submit.edit': 'Save changes',
    'dialog.submitting.create': 'Creating...',
    'dialog.submitting.edit': 'Saving...',
    'dialog.error.save': "Couldn't save the task. Please try again.",

    // Teams
    'team.switch': 'Switch team',
    'team.switcher.current': 'Current team',
    'team.role.owner': 'Owner',
    'team.role.member': 'Member',
    'team.new': '＋ New team',
    'team.manage': 'Manage team',
    'team.create.title': 'New team',
    'team.create.name': 'Team name',
    'team.create.name.placeholder': 'e.g. Marketing',
    'team.create.name.required': 'Please enter a team name',
    'team.create.submit': 'Create team',
    'team.create.submitting': 'Creating...',
    'team.create.error': "Couldn't create the team. Please try again.",

    // Team panel (Pass B)
    'teamPanel.title': 'Manage team',
    'teamPanel.members': 'Members',
    'teamPanel.you': 'you',
    'teamPanel.member.remove': 'Remove',
    'teamPanel.member.removeConfirm': 'Remove?',
    'teamPanel.invite': 'Invite people',
    'teamPanel.invite.email.placeholder': 'Email address',
    'teamPanel.invite.email.invalid': 'That email address is invalid',
    'teamPanel.invite.send': 'Send invite',
    'teamPanel.invite.sent': 'Invitation emailed',
    'teamPanel.invite.hint': 'We email a join link. The person must already have a Stack account.',
    'teamPanel.invite.pending': 'Pending',
    'teamPanel.invite.error.noAccount': 'No account with that email address',
    'teamPanel.invite.error.alreadyMember': 'Already a member of this team',
    'teamPanel.invite.error.emailFailed':
      "Invitation created, but the email didn't send — copy the link below.",
    'teamPanel.invite.email.alreadyInvited': 'That address already has a pending invitation.',
    'teamPanel.link.label': 'Invite link',
    'teamPanel.link.create': 'Create a shareable invite link',
    'teamPanel.link.copy': 'Copy',
    'teamPanel.link.copied': 'Copied',
    'teamPanel.link.revoke': 'Revoke',
    'teamPanel.leave': 'Leave team',
    'teamPanel.delete': 'Delete team',
    'teamPanel.delete.confirm': 'Delete permanently?',
    'teamPanel.error.generic': 'Something went wrong. Please try again.',
    'teamPanel.error.notOwner': 'Only an owner can invite people',
    'teamPanel.error.copy': "Couldn't copy the link",

    // Invite accept page (Pass B)
    'invite.working': 'Adding you to the team...',
    'invite.toBoard': 'Go to the board',
    'invite.error.generic': "Couldn't accept this invitation.",
    'invite.error.notFound': "This invitation doesn't exist.",
    'invite.error.used': 'This invitation has already been used.',
    'invite.error.expired': 'This invitation has expired.',
    'invite.wrongAccount': 'This invitation was sent to a different email address',

    // Errors (emitted as keys by services)
    'errors.loadTasks': 'Failed to load tasks',
    'errors.loadTeams': 'Failed to load teams',
    'errors.switchTeam': 'Could not switch team',
    'errors.renameTeam': 'Failed to rename the team',
    'errors.lastTeam': "You can't leave your last team",

    // Accessibility
    'a11y.switchLang': 'Switch language',
  },
};
