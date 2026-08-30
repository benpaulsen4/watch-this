import { Button, Input, Modal } from "watch-this";

const noop = () => {};

export function ConfirmDialog() {
  return (
    <Modal
      isOpen
      onClose={noop}
      size="sm"
      title="Remove from list?"
      subtitle="Dune: Part Two will be removed from Weekend Watchlist."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm">
            Cancel
          </Button>
          <Button variant="destructive" size="sm">
            Remove
          </Button>
        </div>
      }
    >
      <p className="text-sm text-gray-300">
        Collaborators will see this change straight away. You can add the title
        back at any time.
      </p>
    </Modal>
  );
}

export function FormDialog() {
  return (
    <Modal
      isOpen
      onClose={noop}
      size="md"
      title="Create a list"
      subtitle="Lists are private until you invite someone."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm">
            Cancel
          </Button>
          <Button size="sm">Create list</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input label="List name" placeholder="Weekend Watchlist" />
        <Input
          label="Invite by username"
          placeholder="ana_watches"
          helperText="Optional — you can invite people later."
        />
      </div>
    </Modal>
  );
}

export function Glass() {
  return (
    <Modal
      isOpen
      onClose={noop}
      variant="glass"
      size="sm"
      title="Invite link reset"
      hideCloseButton
    >
      <p className="text-sm text-gray-300">
        The previous link no longer works. Share the new one with anyone who
        still needs access.
      </p>
    </Modal>
  );
}
