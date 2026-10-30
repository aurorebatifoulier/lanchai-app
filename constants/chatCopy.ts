// Chat — every screen string (renter chat + admin chat + saved replies). Edit here only.
// Sentence case.
export const CHAT_COPY = {
  title: 'LANCHAI',
  replies: 'Usually replies within a few hours',
  openUntil: (t: string) => `Open until ${t}`,
  closedNow: 'Closed now',
  about: 'About',
  view: 'View',
  placeholder: 'Message LANCHAI…',
  read: 'Read',
  quick: ['Where’s the shop?', 'Extend my rental', 'How does the deposit work?'],
  photoFailed: 'Photo can’t load · Tap to retry',
  videoTap: 'Video · Tap to play',
  aboutLine: (name: string) => `About: ${name}`,

  // Admin
  savedReplies: 'Saved replies',
  savedRepliesSub: 'One tap in a conversation inserts the text.',
  savedNew: 'New reply',
  savedPlaceholder: 'Type a reply you send often…',
  savedSave: 'Save reply',
  savedDeleteAsk: 'Delete this saved reply?',
  savedEmpty: 'No saved replies yet.',
  savedError: 'Couldn’t save. Please try again.',
} as const;
