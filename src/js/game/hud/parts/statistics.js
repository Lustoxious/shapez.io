import { Math_min } from "../../../core/builtins";
import { InputReceiver } from "../../../core/input_receiver";
import { makeButton, makeDiv, removeAllChildren } from "../../../core/utils";
import { KeyActionMapper } from "../../key_action_mapper";
import { enumAnalyticsDataSource } from "../../production_analytics";
import { BaseHUDPart } from "../base_hud_part";
import { DynamicDomAttach } from "../dynamic_dom_attach";
import { enumDisplayMode, HUDShapeStatisticsHandle } from "./statistics_handle";

export class HUDStatistics extends BaseHUDPart {
    createElements(parent) {
        this.background = makeDiv(parent, "ingame_HUD_Statistics", ["ingameDialog"]);

        // DIALOG Inner / Wrapper
        this.dialogInner = makeDiv(this.background, null, ["dialogInner"]);
        this.title = makeDiv(this.dialogInner, null, ["title"], `statistics`);
        this.closeButton = makeDiv(this.title, null, ["closeButton"]);
        this.trackClicks(this.closeButton, this.close);

        this.filterHeader = makeDiv(this.dialogInner, null, ["filterHeader"]);

        this.filtersDataSource = makeDiv(this.filterHeader, null, ["filtersDataSource"]);
        this.filtersDisplayMode = makeDiv(this.filterHeader, null, ["filtersDisplayMode"]);

        const buttonModeProduced = makeButton(this.filtersDataSource, ["modeProduced"], "Produced");
        const buttonModeDelivered = makeButton(this.filtersDataSource, ["modeDelivered"], "Delivered");
        const buttonModeStored = makeButton(this.filtersDataSource, ["modeStored"], "Stored");

        this.trackClicks(buttonModeProduced, () => this.setDataSource(enumAnalyticsDataSource.produced));
        this.trackClicks(buttonModeStored, () => this.setDataSource(enumAnalyticsDataSource.stored));
        this.trackClicks(buttonModeDelivered, () => this.setDataSource(enumAnalyticsDataSource.delivered));

        const buttonDisplayDetailed = makeButton(this.filtersDisplayMode, ["displayDetailed"]);
        const buttonDisplayIcons = makeButton(this.filtersDisplayMode, ["displayIcons"]);

        this.trackClicks(buttonDisplayIcons, () => this.setDisplayMode(enumDisplayMode.icons));
        this.trackClicks(buttonDisplayDetailed, () => this.setDisplayMode(enumDisplayMode.detailed));

        this.contentDiv = makeDiv(this.dialogInner, null, ["content"]);
    }

    /**
     * @param {enumAnalyticsDataSource} source
     */
    setDataSource(source) {
        this.dataSource = source;
        this.dialogInner.setAttribute("data-datasource", source);
        if (this.visible) {
            this.rerenderFull();
        }
    }

    /**
     * @param {enumDisplayMode} mode
     */
    setDisplayMode(mode) {
        this.displayMode = mode;
        this.dialogInner.setAttribute("data-displaymode", mode);
        if (this.visible) {
            this.rerenderFull();
        }
    }

    initialize() {
        this.domAttach = new DynamicDomAttach(this.root, this.background, {
            attachClass: "visible",
        });

        this.inputReciever = new InputReceiver("statistics");
        this.keyActionMapper = new KeyActionMapper(this.root, this.inputReciever);

        this.keyActionMapper.getBinding("back").add(this.close, this);
        this.keyActionMapper.getBinding("menu_open_stats").add(this.close, this);

        /** @type {Object.<string, HUDShapeStatisticsHandle>} */
        this.activeHandles = {};

        this.setDataSource(enumAnalyticsDataSource.produced);
        this.setDisplayMode(enumDisplayMode.detailed);

        this.intersectionObserver = new IntersectionObserver(this.intersectionCallback.bind(this), {
            root: this.contentDiv,
        });

        this.lastFullRerender = 0;

        this.close();
        this.rerenderFull();
    }

    intersectionCallback(entries) {
        for (let i = 0; i < entries.length; ++i) {
            const entry = entries[i];
            const handle = this.activeHandles[entry.target.getAttribute("data-shape-key")];
            if (handle) {
                handle.setVisible(entry.intersectionRatio > 0);
            }
        }
    }

    cleanup() {
        document.body.classList.remove("ingameDialogOpen");
    }

    show() {
        this.visible = true;
        document.body.classList.add("ingameDialogOpen");
        this.root.app.inputMgr.makeSureAttachedAndOnTop(this.inputReciever);
        this.rerenderFull();
        this.update();
    }

    close() {
        this.visible = false;
        document.body.classList.remove("ingameDialogOpen");
        this.root.app.inputMgr.makeSureDetached(this.inputReciever);
        this.update();
    }

    update() {
        this.domAttach.update(this.visible);
        if (this.visible) {
            if (this.root.time.now() - this.lastFullRerender > 1) {
                this.lastFullRerender = this.root.time.now();
                this.lastPartialRerender = this.root.time.now();
                this.rerenderFull();
            }
            this.rerenderPartial();
        }
    }

    /**
     * Performs a partial rerender, only updating graphs and counts
     */
    rerenderPartial() {
        for (const key in this.activeHandles) {
            const handle = this.activeHandles[key];
            handle.update(this.displayMode, this.dataSource);
        }
    }

    /**
     * Performs a full rerender, regenerating everything
     */
    rerenderFull() {
        removeAllChildren(this.contentDiv);

        // Now, attach new ones
        const entries = Object.entries(this.root.hubGoals.storedShapes);
        entries.sort((a, b) => b[1] - a[1]);

        let rendered = new Set();

        for (let i = 0; i < Math_min(entries.length, 200); ++i) {
            const entry = entries[i];
            const shapeKey = entry[0];
            const amount = entry[1];
            if (amount < 1) {
                continue;
            }

            let handle = this.activeHandles[shapeKey];
            if (!handle) {
                const definition = this.root.shapeDefinitionMgr.getShapeFromShortKey(shapeKey);
                handle = this.activeHandles[shapeKey] = new HUDShapeStatisticsHandle(
                    this.root,
                    definition,
                    this.intersectionObserver
                );
            }

            rendered.add(shapeKey);
            handle.attach(this.contentDiv);
        }

        for (const key in this.activeHandles) {
            if (!rendered.has(key)) {
                this.activeHandles[key].destroy();
                delete this.activeHandles[key];
            }
        }

        if (entries.length === 0) {
            this.contentDiv.innerHTML = `
            <strong class="noEntries">No shapes have been produced so far.</strong>`;
        }

        this.contentDiv.classList.toggle("hasEntries", entries.length > 0);
    }
}
