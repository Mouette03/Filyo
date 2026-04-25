import { useT } from '../i18n'

interface Props {
  title: string
  message?: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: Props) {
  const { t } = useT()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      {/* Panel */}
      <div className="relative bg-[#1a1a2e] border border-white/10 rounded-2xl shadow-2xl p-6 w-full max-w-sm">
        <h2 className="text-base font-semibold mb-2">{title}</h2>
        {message && <p className="text-sm text-white/50 mb-5">{message}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="btn-secondary text-sm px-4 py-2">
            {t('common.cancel')}
          </button>
          <button onClick={onConfirm} className="btn-danger text-sm px-4 py-2">
            {confirmLabel ?? t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  )
}
