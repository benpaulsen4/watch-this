import { QRCode } from "watch-this";

export function Default() {
  return <QRCode value="https://watchthis.app/lists/weekend-watchlist" />;
}

export function Sizes() {
  return (
    <div className="flex items-end gap-6">
      <QRCode value="https://watchthis.app/invite/ana" size={96} />
      <QRCode value="https://watchthis.app/invite/ana" size={140} />
      <QRCode value="https://watchthis.app/invite/ana" size={180} />
    </div>
  );
}

export function InvitePanel() {
  return (
    <div className="max-w-xs rounded-xl border border-gray-700 bg-gray-800/50 p-6 text-center">
      <QRCode
        value="https://watchthis.app/invite/weekend-watchlist"
        size={160}
        className="mx-auto rounded-lg"
      />
      <p className="mt-4 text-sm font-medium text-gray-100">
        Scan to join this list
      </p>
      <p className="mt-1 text-xs text-gray-400">
        The link expires once you reset it.
      </p>
    </div>
  );
}
