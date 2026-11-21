/** A turning ring over a button whose request is in flight (ticket 30); the button keeps its word, unseen, so its name and width stay. */
export function Spinner() {
  return (
    <svg data-spinner aria-hidden="true" viewBox="0 0 24 24" className="absolute inset-0 m-auto size-5 animate-spin" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
