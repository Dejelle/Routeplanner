export default function TabButton({ id, icon, label, active, onClick }) {
  return (
    <button
      onClick={() => onClick(id)}
      title={label}
      className={`relative flex items-center justify-center w-10 py-4 transition-colors hover:bg-slate-50 ${
        active ? 'bg-blue-50 text-blue-700' : 'text-slate-500'
      }`}
    >
      {active && (
        <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-600 rounded-r" />
      )}
      <span className="flex flex-col items-center gap-1.5">
        <span className="text-base leading-none">{icon}</span>
        <span
          className="text-[10px] font-medium leading-none tracking-wide whitespace-nowrap"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          {label}
        </span>
      </span>
    </button>
  );
}
