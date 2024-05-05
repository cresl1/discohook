import { DiscordErrorData, REST } from "@discordjs/rest";
import { useFetcher } from "@remix-run/react";
import { APIMessage, APIWebhook, ButtonStyle } from "discord-api-types/v10";
import { useEffect, useReducer, useState } from "react";
import { useTranslation } from "react-i18next";
import { BRoutes, apiUrl } from "~/api/routing";
import { Button } from "~/components/Button";
import { getMessageText } from "~/components/editor/MessageEditor";
import { CoolIcon } from "~/components/icons/CoolIcon";
import { DraftFile, getQdMessageId } from "~/routes/_index";
import { QueryData } from "~/types/QueryData";
import { MESSAGE_REF_RE } from "~/util/constants";
import { cdn, executeWebhook, updateWebhookMessage } from "~/util/discord";
import { action as ApiAuditLogAction } from "../api/v1/audit-log";
import { MessageSendResultModal } from "./MessageSendResultModal";
import { MessageTroubleshootModal } from "./MessageTroubleshootModal";
import { Modal, ModalProps } from "./Modal";

const countSelected = (data: Record<string, boolean>) =>
  Object.values(data).filter((v) => v).length;

export type SubmitMessageResult =
  | {
      status: "success";
      data: APIMessage;
    }
  | {
      status: "error";
      data: DiscordErrorData;
    };

export const submitMessage = async (
  target: Pick<APIWebhook, "id" | "token">,
  message: QueryData["messages"][number],
  files?: DraftFile[],
  rest?: REST,
): Promise<SubmitMessageResult> => {
  const token = target.token;
  if (!token) {
    return {
      status: "error",
      data: {
        code: -1,
        message: "No webhook token was provided.",
      },
    };
  }
  let data: APIMessage | DiscordErrorData;
  if (message.reference) {
    const match = message.reference.match(MESSAGE_REF_RE);
    if (!match) {
      throw Error(`Invalid message reference: ${message.reference}`);
    }
    data = await updateWebhookMessage(
      target.id,
      token,
      match[3],
      {
        content: message.data.content?.trim() || undefined,
        embeds: message.data.embeds || undefined,
      },
      files,
      undefined,
      rest,
    );
  } else {
    data = await executeWebhook(
      target.id,
      token,
      {
        username: message.data.author?.name,
        avatar_url: message.data.author?.icon_url,
        content: message.data.content?.trim() || undefined,
        embeds: message.data.embeds || undefined,
      },
      files,
      undefined,
      rest,
    );
  }
  return {
    status: "code" in data ? "error" : "success",
    data: "code" in data ? (data as unknown as DiscordErrorData) : data,
  } as SubmitMessageResult;
};

export const MessageSendModal = (
  props: ModalProps & {
    targets: Record<string, APIWebhook>;
    setAddingTarget: (open: boolean) => void;
    data: QueryData;
    files?: Record<string, DraftFile[]>;
  },
) => {
  const { t } = useTranslation();
  const { targets, setAddingTarget, data, files } = props;

  const auditLogFetcher = useFetcher<typeof ApiAuditLogAction>();
  // const backupFetcher = useFetcher<typeof ApiBackupsAction>();

  const [selectedWebhooks, updateSelectedWebhooks] = useReducer(
    (d: Record<string, boolean>, partialD: Record<string, boolean>) => ({
      ...d,
      ...partialD,
    }),
    {},
  );

  // We don't want to execute this hook every time selectedWebhooks updates
  // (which is also every time this hook runs)
  // biome-ignore lint/correctness/useExhaustiveDependencies:
  useEffect(() => {
    // Set new targets to be enabled by default,
    // but don't affect manually updated ones
    updateSelectedWebhooks(
      Object.keys(targets)
        .filter((targetId) => !Object.keys(selectedWebhooks).includes(targetId))
        .reduce(
          (o, targetId) => ({
            // biome-ignore lint/performance/noAccumulatingSpread:
            ...o,
            [targetId]: true,
          }),
          {},
        ),
    );
  }, [targets]);

  // Indexed by stringified data.messages index
  type MessagesData = Record<
    string,
    { result?: SubmitMessageResult; enabled: boolean }
  >;
  const [messages, updateMessages] = useReducer(
    (d: MessagesData, partialD: MessagesData) => ({
      ...d,
      ...partialD,
    }),
    {},
  );
  const enabledMessagesCount = Object.values(messages).filter(
    (d) => d.enabled,
  ).length;
  useEffect(() => {
    // Reset all messages to be enabled by default
    // since the index is not a static identifier
    updateMessages(
      data.messages
        .map((_, i) => i)
        .reduce(
          (o, index) => ({
            // biome-ignore lint/performance/noAccumulatingSpread:
            ...o,
            [index]: { enabled: true },
          }),
          {},
        ),
    );
  }, [data.messages]);

  const setOpen = (s: boolean) => {
    props.setOpen(s);
    if (!s) {
      updateMessages(
        Array(10)
          .fill(undefined)
          .map((_, i) => i)
          .reduce(
            (o, index) => ({
              // biome-ignore lint/performance/noAccumulatingSpread:
              ...o,
              [index]: { result: undefined, enabled: true },
            }),
            {},
          ),
      );
    }
  };

  const [showingResult, setShowingResult] = useState<SubmitMessageResult>();
  const [troubleshootOpen, setTroubleshootOpen] = useState(false);

  return (
    <Modal
      title={`Send Message${data.messages.length === 1 ? "" : "s"}`}
      {...props}
      setOpen={setOpen}
    >
      <MessageSendResultModal
        open={!!showingResult}
        setOpen={() => setShowingResult(undefined)}
        result={showingResult}
      />
      <MessageTroubleshootModal
        open={troubleshootOpen}
        setOpen={setTroubleshootOpen}
      />
      <p className="text-sm font-medium">Messages</p>
      <div className="space-y-1">
        {data.messages.length > 0 ? (
          data.messages.map((message, i) => {
            const previewText = getMessageText(message.data);
            return (
              <div key={`message-send-${i}`} className="flex">
                <label className="flex grow rounded bg-gray-200 dark:bg-gray-700 py-2 px-4 w-full cursor-pointer overflow-hidden">
                  {!!messages[i]?.result && (
                    <CoolIcon
                      icon={
                        messages[i]?.result?.status === "success"
                          ? "Check"
                          : "Close_MD"
                      }
                      className={`text-2xl my-auto mr-1 ${
                        messages[i]?.result?.status === "success"
                          ? "text-green-600"
                          : "text-rose-600"
                      }`}
                    />
                  )}
                  <div className="my-auto grow text-left ltr:mr-2 rtl:ml-2 truncate">
                    <p className="font-semibold text-base truncate">
                      Message {i + 1}
                      {!!previewText && (
                        <span className="truncate ltr:ml-1 rtl:mr-1">
                          - {previewText}
                        </span>
                      )}
                    </p>
                    {messages[i]?.result?.status === "error" && (
                      <p className="text-rose-500 text-sm leading-none">
                        <CoolIcon
                          icon="Circle_Warning"
                          className="ltr:mr-1 rtl:ml-1"
                        />
                        {(messages[i].result?.data as DiscordErrorData).message}
                      </p>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    name="message"
                    checked={!!messages[i]?.enabled}
                    onChange={(e) =>
                      updateMessages({
                        [i]: { enabled: e.currentTarget.checked },
                      })
                    }
                    hidden
                  />
                  <div className="ltr:ml-auto rtl:mr-auto my-auto space-x-2 rtl:space-x-reverse text-2xl text-blurple dark:text-blurple-400">
                    {message.reference && (
                      <CoolIcon
                        title={t("willBeEdited")}
                        icon="Edit_Pencil_01"
                      />
                    )}
                    <CoolIcon
                      icon={
                        messages[i]?.enabled
                          ? "Checkbox_Check"
                          : "Checkbox_Unchecked"
                      }
                    />
                  </div>
                </label>
                {messages[i]?.result && (
                  <button
                    type="button"
                    className="flex ml-2 p-2 text-2xl rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 hover:dark:bg-gray-600 text-blurple dark:text-blurple-400 hover:text-blurple-400 hover:dark:text-blurple-300 transition"
                    onClick={() => setShowingResult(messages[i].result)}
                  >
                    <CoolIcon icon="Info" className="m-auto" />
                  </button>
                )}
              </div>
            );
          })
        ) : (
          <p>{t("noMessages")}</p>
        )}
      </div>
      <hr className="border border-gray-400 dark:border-gray-600 my-4" />
      <p className="text-sm font-medium">Webhooks</p>
      <div className="space-y-1">
        {Object.keys(targets).length > 0 ? (
          Object.entries(targets).map(([targetId, target]) => {
            return (
              <label
                key={`target-${targetId}`}
                className="flex rounded bg-gray-200 dark:bg-gray-700 py-2 px-4 w-full cursor-pointer"
              >
                <img
                  src={
                    target.avatar
                      ? cdn.avatar(target.id, target.avatar, { size: 64 })
                      : cdn.defaultAvatar(5)
                  }
                  alt={target.name ?? "Webhook"}
                  className="rounded-full h-12 w-12 mr-2 my-auto shrink-0"
                />
                <div className="my-auto grow text-left truncate mr-2">
                  <p className="font-semibold text-base truncate">
                    {target.name ?? "Webhook"}
                  </p>
                  <p className="text-sm leading-none truncate">
                    Channel ID {target.channel_id}
                  </p>
                </div>
                <input
                  type="checkbox"
                  name="webhook"
                  checked={!!selectedWebhooks[target.id]}
                  onChange={(e) =>
                    updateSelectedWebhooks({
                      [target.id]: e.currentTarget.checked,
                    })
                  }
                  hidden
                />
                <CoolIcon
                  icon={
                    selectedWebhooks[target.id]
                      ? "Checkbox_Check"
                      : "Checkbox_Unchecked"
                  }
                  className="ml-auto my-auto text-2xl text-blurple dark:text-blurple-400"
                />
              </label>
            );
          })
        ) : (
          <div>
            <p>You have no webhooks to send to.</p>
            <Button onClick={() => setAddingTarget(true)}>Add Webhook</Button>
          </div>
        )}
      </div>
      <div className="flex mt-4">
        <div className="mx-auto space-x-2 rtl:space-x-reverse">
          <Button
            disabled={
              countSelected(selectedWebhooks) === 0 ||
              enabledMessagesCount === 0
            }
            onClick={async () => {
              for (const [targetId] of Object.entries(selectedWebhooks).filter(
                ([_, v]) => v,
              )) {
                const webhook = targets[targetId];
                if (!webhook) continue;

                for (const [index] of Object.entries(messages).filter(
                  ([_, v]) => v.enabled,
                )) {
                  const message = data.messages[Number(index)];
                  if (!message) continue;
                  if (
                    message.data.webhook_id &&
                    targetId !== message.data.webhook_id
                  ) {
                    updateMessages({
                      [index]: {
                        result: {
                          status: "error",
                          data: {
                            code: 0,
                            message: t("skippedEdit"),
                          },
                        },
                        enabled: true,
                      },
                    });
                    continue;
                  }

                  const result = await submitMessage(
                    webhook,
                    message,
                    files?.[getQdMessageId(message)],
                  );
                  if (result.status === "success") {
                    auditLogFetcher.submit(
                      {
                        type: message.reference ? "edit" : "send",
                        webhookId: webhook.id,
                        // biome-ignore lint/style/noNonNullAssertion: We needed the token in order to arrive at a success state
                        webhookToken: webhook.token!,
                        messageId: result.data.id,
                        // threadId: ,
                      },
                      {
                        method: "POST",
                        action: apiUrl(BRoutes.auditLog()),
                      },
                    );
                  }

                  updateMessages({
                    [index]: { result, enabled: true },
                  });
                }
              }
            }}
          >
            {t(
              countSelected(selectedWebhooks) <= 1 && enabledMessagesCount > 1
                ? "sendAll"
                : countSelected(selectedWebhooks) > 1
                  ? "sendToAll"
                  : "send",
            )}
          </Button>
          <Button
            discordstyle={ButtonStyle.Secondary}
            onClick={() => setTroubleshootOpen(true)}
          >
            {t("havingTrouble")}
          </Button>
          {/* <Button
            disabled={
              countSelected(selectedWebhooks) === 0 ||
              enabledMessagesCount === 0
            }
            onClick={() => {}}
          >
            {t(enabledMessagesCount > 1 ? "scheduleSendAll" : "schedule")}
          </Button> */}
        </div>
      </div>
    </Modal>
  );
};
