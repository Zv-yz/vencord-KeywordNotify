/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { DataStore } from "@api/index";
import { definePluginSettings } from "@api/Settings";
import { Flex } from "@components/Flex";
import { DeleteIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import { Margins } from "@utils/margins";
import { useForceUpdater } from "@utils/react";
import definePlugin, { OptionType } from "@utils/types";
import { findByCodeLazy, findByPropsLazy } from "@webpack";
import { Button, ChannelStore, Forms, GuildStore, NavigationRouter, SearchableSelect, SelectedChannelStore, TabBar, TextInput, UserStore, UserUtils, useState } from "@webpack/common";
import { Message, User } from "discord-types/general/index.js";

let keywordEntries: Array<{ regex: string, listIds: Array<string>, listType: ListType; }> = [];
let currentUser: User;
let keywordLog: Array<any> = [];

const MenuHeader = findByCodeLazy(".useInDesktopNotificationCenterExperiment)()?");
const Popout = findByCodeLazy("let{analyticsName:");
const recentMentionsPopoutClass = findByPropsLazy("recentMentionsPopout");

const { createMessageRecord } = findByPropsLazy("createMessageRecord", "updateMessageRecord");

const TypeToName = {
    1: "Direct Channel",
    3: "Group DM",
};

function NavigateToChannel(guildId: string | null, channelId: string) {
    if (!ChannelStore.hasChannel(channelId)) return;
    NavigationRouter.transitionTo(`/channels/${guildId ?? "@me"}/${channelId}`);
}

function Notify(m, guild, channel) {
    const username = `${m.author.username}${m.author.discriminator !== "0" ? `#${m.author.discriminator}` : ""}`;
    const Guild = guild?.name;
    const Channel = channel?.name !== "" ? channel.name : TypeToName[channel.type];

    const n = new Notification("[KeywordTracker] Detected message!", {
        silent: true,
        body: `Username: ${username}\nID: ${m.author.id}\nContent: ${m.content}\n${Guild ? `Guild: ${Guild}\n` : ""}Channel: ${Channel}`,
        icon: `https://${window.GLOBAL_ENV.CDN_HOST}/avatars/${m.author.id}/${m.author.avatar}`
    });
    n.onclick = function () {
        NavigateToChannel(m.guild_id, m.channel_id);
    };
}

async function addKeywordEntry(updater: () => void) {
    keywordEntries.push({ regex: "", listIds: [], listType: ListType.BlackList });
    await DataStore.set("KeywordNotify_keywordEntries", keywordEntries);
    updater();
}

async function setKeywordEntry(idx: number, reg: string, listIds: Array<string>, listType: ListType) {
    keywordEntries[idx] = { regex: reg, listIds, listType };
    await DataStore.set("KeywordNotify_keywordEntries", keywordEntries);
}

async function removeKeywordEntry(idx: number, updater: () => void) {
    keywordEntries.splice(idx, 1);
    await DataStore.set("KeywordNotify_keywordEntries", keywordEntries);
    updater();
}

function safeMatchesRegex(s: string, r: string) {
    try {
        return s.match(new RegExp(r));
    } catch {
        return false;
    }
}

enum ListType {
    BlackList = "BlackList",
    Whitelist = "Whitelist"
}

function highlightKeywords(s: string, r: Array<string>) {
    let regex: RegExp;
    try {
        regex = new RegExp(r.join("|"), "g");
    } catch {
        return [s];
    }

    const matches = s.match(regex);
    if (!matches)
        return [s];

    const parts = [...matches.map(e => {
        const idx = s.indexOf(e);
        const before = s.substring(0, idx);
        s = s.substring(idx + e.length);
        return before;
    }, s), s];

    return parts.map(e => [
        (<span>{e}</span>),
        matches!.length ? (<span className="highlight">{matches!.splice(0, 1)[0]}</span>) : []
    ]);
}

function Collapsible({ title, children }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div>
            <Button
                onClick={() => setIsOpen(!isOpen)}
                look={Button.Looks.BLANK}
                size={Button.Sizes.ICON}
                className="keywordnotify-collapsible">
                <div style={{ display: "flex", alignItems: "center" }}>
                    <div style={{ marginLeft: "auto", color: "var(--text-muted)", paddingRight: "5px" }}>{isOpen ? "▼" : "▶"}</div>
                    <Forms.FormTitle tag="h4">{title}</Forms.FormTitle>
                </div>
            </Button>
            {isOpen && children}
        </div>
    );
}

function ListedIds({ listIds, setListIds }) {
    const update = useForceUpdater();
    const [values, setValues] = useState(listIds);

    const elements = values.map((id, i) => {
        const setId = (v: string) => {
            const valuesCopy = [...values];
            valuesCopy[i] = v;
            setValues(valuesCopy);
        };

        return (
            <Flex flexDirection="row" style={{ marginBottom: "5px" }}>
                <div style={{ flexGrow: 1 }}>
                    <TextInput
                        placeholder="ID"
                        spellCheck={false}
                        value={values[i]}
                        onChange={setId}
                        onBlur={() => setListIds(values)}
                    />
                </div>
                <Button
                    onClick={() => {
                        values.splice(i, 1);
                        setListIds(values);
                        update();
                    }}
                    look={Button.Looks.BLANK}
                    size={Button.Sizes.ICON}
                    className="keywordnotify-delete">
                    <DeleteIcon />
                </Button>
            </Flex>
        );
    });

    return (
        <>
            {elements}
        </>
    );
}

function ListTypeSelector({ listType, setListType }) {
    return (
        <SearchableSelect
            options={[
                { label: "Whitelist", value: ListType.Whitelist },
                { label: "Blacklist", value: ListType.BlackList }
            ]}
            placeholder={"Select a list type"}
            maxVisibleItems={2}
            closeOnSelect={true}
            value={listType}
            onChange={setListType}
        />
    );
}


function KeywordEntries() {
    const update = useForceUpdater();
    const [values, setValues] = useState(keywordEntries);

    const elements = keywordEntries.map((entry, i) => {
        const setRegex = (v: string) => {
            const valuesCopy = [...values];
            valuesCopy[i].regex = v;
            setValues(valuesCopy);
        };

        const setListIds = (v: Array<string>) => {
            const valuesCopy = [...values];
            valuesCopy[i].listIds = v;
            setValues(valuesCopy);
        };

        const setListType = (v: ListType) => {
            const valuesCopy = [...values];
            valuesCopy[i].listType = v;
            setValues(valuesCopy);
        };

        return (
            <>
                <Collapsible title={`Keyword Entry ${i + 1}`}>
                    <Flex flexDirection="row">
                        <div style={{ flexGrow: 1 }}>
                            <TextInput
                                placeholder="example|regex"
                                spellCheck={false}
                                value={values[i].regex}
                                onChange={setRegex}
                                onBlur={() => setKeywordEntry(i, values[i].regex, values[i].listIds, values[i].listType)}
                            />
                        </div>
                        <Button
                            onClick={() => removeKeywordEntry(i, update)}
                            look={Button.Looks.BLANK}
                            size={Button.Sizes.ICON}
                            className="keywordnotify-delete">
                            <DeleteIcon />
                        </Button>
                    </Flex>
                    <Forms.FormDivider className={Margins.top8 + " " + Margins.bottom8} />
                    <Forms.FormTitle tag="h5">Whitelist/Blacklist</Forms.FormTitle>
                    <Flex flexDirection="row">
                        <div style={{ flexGrow: 1 }}>
                            <ListedIds listIds={values[i].listIds} setListIds={setListIds} />
                        </div>
                    </Flex>
                    <div className={Margins.top8 + " " + Margins.bottom8} />
                    <Flex flexDirection="row">
                        <Button onClick={() => {
                            values[i].listIds.push("");
                            update();
                        }}>Add ID</Button>
                        <div style={{ flexGrow: 1 }}>
                            <ListTypeSelector listType={values[i].listType} setListType={setListType} />
                        </div>
                    </Flex>
                </Collapsible>
            </>
        );
    });

    return (
        <>
            {elements}
            <div><Button onClick={() => addKeywordEntry(update)}>Add Keyword Entry</Button></div>
        </>
    );
}

const settings = definePluginSettings({
    ignoreBots: {
        type: OptionType.BOOLEAN,
        description: "Ignore messages from bots",
        default: true
    },
    keywords: {
        type: OptionType.COMPONENT,
        description: "",
        component: () => <KeywordEntries />
    }
});

export default definePlugin({
    name: "KeywordNotify",
    authors: [Devs.camila314],
    description: "Sends a notification if a given message matches certain keywords or regexes",
    settings,
    patches: [
        {
            find: "}_dispatch(",
            replacement: {
                match: /}_dispatch\((\i),\i\){/,
                replace: "$&$1=$self.modify($1);"
            }
        },
        {
            find: "Messages.UNREADS_TAB_LABEL}",
            replacement: {
                match: /\i\?\(0,\i\.jsxs\)\(\i\.TabBar\.Item/,
                replace: "$self.keywordTabBar(),$&"
            }
        },
        {
            find: "InboxTab.TODOS?(",
            replacement: {
                match: /:\i&&(\i)===\i\.InboxTab\.TODOS.{1,50}setTab:(\i),onJump:(\i),closePopout:(\i)/,
                replace: ": $1 === 5 ? $self.tryKeywordMenu($2, $3, $4) $&"
            }
        },
        {
            find: ".guildFilter:null",
            replacement: {
                match: /function (\i)\(\i\){let{message:\i,gotoMessage/,
                replace: "$self.renderMsg = $1; $&"
            }
        }
    ],

    async start() {
        keywordEntries = await DataStore.get("KeywordNotify_keywordEntries") ?? [];
        currentUser = await UserUtils.getUser(UserStore.getCurrentUser().id);
        this.onUpdate = () => null;

        (await DataStore.get("KeywordNotify_log") ?? []).map(e => JSON.parse(e)).forEach(e => {
            this.addToLog(e);
        });
    },

    applyKeywordEntries(m: Message, fromcache = false) {
        let matches = false;

        keywordEntries.forEach(entry => {
            if (entry.regex === "") {
                return;
            }

            let listed = entry.listIds.some(id => id === m.channel_id || id === m.author.id);
            if (!listed) {
                const channel = ChannelStore.getChannel(m.channel_id);
                if (channel != null) {
                    listed = entry.listIds.some(id => id === channel.guild_id);
                }
            }

            const whitelistMode = entry.listType === ListType.Whitelist;
            if (!whitelistMode && listed) {
                return;
            }
            if (whitelistMode && !listed) {
                return;
            }

            if (settings.store.ignoreBots && m.author.bot) {
                if (!whitelistMode || !entry.listIds.includes(m.author.id)) {
                    return;
                }
            }

            if (safeMatchesRegex(m.content, entry.regex)) {
                matches = true;
            }

            for (const embed of m.embeds as any) {
                if (safeMatchesRegex(embed.description, entry.regex) || safeMatchesRegex(embed.title, entry.regex)) {
                    matches = true;
                } else if (embed.fields != null) {
                    for (const field of embed.fields as Array<{ name: string, value: string; }>) {
                        if (safeMatchesRegex(field.value, entry.regex) || safeMatchesRegex(field.name, entry.regex)) {
                            matches = true;
                        }
                    }
                }
            }
        });

        if (matches) {
            // @ts-ignore
            // m.mentions.push(currentUser);

            if (m.author.id !== currentUser.id) {
                if (fromcache !== true) {
                    // @ts-ignore
                    Notify(m, Object.values(GuildStore?.getGuilds())?.find(g => g.id === m.guild_id), ChannelStore?.getChannel(m.channel_id));
                }
                this.addToLog(m);
            }
        }
    },

    addToLog(m: Message) {
        if (m == null || keywordLog.some(e => e.id == m.id))
            return;

        const thing = createMessageRecord(m);
        keywordLog.push(thing);
        keywordLog.sort((a, b) => b.timestamp - a.timestamp);

        if (keywordLog.length > 50)
            keywordLog.pop();

        this.onUpdate();
    },


    keywordTabBar() {
        return (
            <TabBar.Item className="vc-settings-tab-bar-item" id={5}>
                Keywords
            </TabBar.Item>
        );
    },

    tryKeywordMenu(setTab, onJump, closePopout) {
        const header = (
            <MenuHeader tab={5} setTab={setTab} closePopout={closePopout} badgeState={{ badgeForYou: false }} />
        );

        const channel = ChannelStore.getChannel(SelectedChannelStore.getChannelId());

        const [tempLogs, setKeywordLog] = useState(keywordLog);
        this.onUpdate = () => {
            const newLog = [...keywordLog];
            setKeywordLog(newLog);

            DataStore.set("KeywordNotify_log", newLog.map(e => JSON.stringify(e)));
        };

        const onDelete = m => {
            keywordLog = keywordLog.filter(e => e.id != m.id);
            this.onUpdate();
        };

        const messageRender = (e, t) => {
            const msg = this.renderMsg({
                message: e,
                gotoMessage: t,
                dismissible: true
            });

            if (msg == null)
                return [null];

            msg.props.children[0].props.children.props.onClick = () => onDelete(e);
            msg.props.children[1].props.children[1].props.message.customRenderedContent = {
                content: highlightKeywords(e.content, keywordEntries.map(e => e.regex))
            };

            return [msg];
        };

        return (
            <>
                <Popout
                    className={recentMentionsPopoutClass.recentMentionsPopout}
                    renderHeader={() => header}
                    renderMessage={messageRender}
                    channel={channel}
                    onJump={onJump}
                    onFetch={() => null}
                    onCloseMessage={onDelete}
                    loadMore={() => null}
                    messages={tempLogs}
                    renderEmptyState={() => null}
                />
            </>
        );
    },

    modify(e) {
        if (e.type == "MESSAGE_CREATE") {
            this.applyKeywordEntries(e.message);
        } else if (e.type == "LOAD_MESSAGES_SUCCESS") {
            for (let msg = 0; msg < e.messages.length; ++msg) {
                this.applyKeywordEntries(e.messages[msg], true);
            }
        }
        return e;
    }
});
