import { Link, useFetcher } from "@remix-run/react";
import { APIWebhook, ButtonStyle } from "discord-api-types/v10";
import { useEffect, useState } from "react";
import LocalizedStrings from "react-localization";
import { Button } from "~/components/Button";
import { Checkbox } from "~/components/Checkbox";
import { CoolIcon } from "~/components/CoolIcon";
import { TextInput } from "~/components/TextInput";
import { User } from "~/session.server";
import { QueryData } from "~/types/QueryData";
import { copyText } from "~/util/text";
import { relativeTime } from "~/util/time";
import { action as backupCreateAction } from "../routes/api.backups";
import { action as shareCreateAction } from "../routes/api.share";
import { Modal, ModalProps } from "./Modal";

const strings = new LocalizedStrings({
  en: {
    title: "Save Message",
    temporaryUrl: "Temporary Share URL",
    copy: "Copy",
    expiresAt: "This link expires at {0} ({1}).",
    options: "Options",
    manageBackups: "Visit your user page to manage backups.",
    logInToSave: "Log in to save permanent backups.",
  },
});

export const MessageSaveModal = (
  props: ModalProps & {
    targets: Record<string, APIWebhook>;
    data: QueryData;
    setData: React.Dispatch<React.SetStateAction<QueryData>>;
    user?: User | null;
  }
) => {
  const { targets, data, setData, user } = props;

  const [includeTargets, setIncludeTargets] = useState(false);

  const shareFetcher = useFetcher<typeof shareCreateAction>(),
    backupFetcher = useFetcher<typeof backupCreateAction>();

  useEffect(() => {
    if (props.open) {
      shareFetcher.submit(
        {
          data: JSON.stringify({
            ...data,
            targets: includeTargets
              ? Object.values(targets).map((t) => ({
                  url: `https://discord.com/api/webhooks/${t.id}/${t.token}`,
                }))
              : undefined,
          }),
        },
        { method: "POST", action: "/api/share" }
      );
    }
  }, [props.open, includeTargets, data, targets]);

  const [backup, setBackup] = useState<typeof backupFetcher.data>();
  useEffect(() => setBackup(backupFetcher.data), [backupFetcher.data]);
  useEffect(() => {
    if (props.open && user && data.backup_id !== undefined && !backup) {
      backupFetcher.load(`/api/backups/${data.backup_id}`);
    }
    if (props.open && backup && typeof data.backup_id !== "number") {
      setData({ ...data, backup_id: backup.id });
    }
  }, [props.open, backup]);

  return (
    <Modal title={strings.title} {...props}>
      <div className="flex">
        <div className="grow">
          <TextInput
            label={strings.temporaryUrl}
            className="w-full"
            value={shareFetcher.data ? shareFetcher.data.url : ""}
            readOnly
          />
        </div>
        <Button
          disabled={!shareFetcher.data || shareFetcher.state !== "idle"}
          onClick={() =>
            copyText(shareFetcher.data ? shareFetcher.data.url : "")
          }
          className="ml-2 mt-auto"
        >
          {strings.copy}
        </Button>
      </div>
      {shareFetcher.data && (
        <p className="mt-1">
          {strings.formatString(
            strings.expiresAt,
            <span className="font-medium">
              {new Date(shareFetcher.data.expires).toLocaleString()}
            </span>,
            <>{relativeTime(new Date(shareFetcher.data.expires))}</>
          )}
        </p>
      )}
      <p className="text-sm font-medium mt-1">{strings.options}</p>
      <Checkbox
        label="Include webhook URLs"
        checked={includeTargets}
        onChange={(e) => setIncludeTargets(e.currentTarget.checked)}
      />
      <hr className="border border-gray-400 dark:border-gray-600 my-4" />
      <p className="text-lg font-medium">Backup</p>
      {user ? (
        <div>
          <Link
            to="/me"
            target="_blank"
            className="text-[#006ce7] dark:text-[#00a8fc] hover:underline"
          >
            {strings.manageBackups}
          </Link>
          {backupFetcher.state !== "idle" || backup ? (
            <div className="rounded bg-gray-200 dark:bg-gray-700 p-2 flex">
              <CoolIcon
                icon="File_Document"
                className="ml-2 mr-4 text-4xl my-auto"
              />
              <div className="my-auto grow">
                {backup ? (
                  <p className="font-semibold">{backup.name}</p>
                ) : (
                  <div className="h-5 rounded-full bg-gray-400 dark:bg-gray-600 w-1/5 mt-px" />
                )}
                <p className="text-sm">Saved automatically</p>
              </div>
              <Button
                disabled={!backup}
                className="my-auto ml-auto"
                discordstyle={ButtonStyle.Danger}
                onClick={() => {
                  delete data.backup_id
                  setData({ ...data });
                  setBackup(undefined);
                }}
              >
                Unlink
              </Button>
            </div>
          ) : (
            <div className="mt-1">
              <Button
                onClick={() =>
                  backupFetcher.submit(
                    {
                      data: JSON.stringify(data),
                    },
                    {
                      action: "/api/backups",
                      method: "POST",
                    }
                  )
                }
              >
                Save Backup
              </Button>
            </div>
          )}
        </div>
      ) : (
        <Link
          to="/auth/discord"
          target="_blank"
          className="text-[#006ce7] dark:text-[#00a8fc] hover:underline"
        >
          {strings.logInToSave}
        </Link>
      )}
    </Modal>
  );
};