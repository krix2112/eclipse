"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Film,
  Star,
  ArrowRightLeft,
} from "lucide-react";
import type { MovieNode, ConnectionMode } from "@/lib/graph";
import { getDecadeFromYear, getNodeWatchedTime } from "@/lib/graph";

export const METRO_PALETTE = [
  "#E15759", // Crimson Red
  "#4E79A7", // Deep Slate Blue
  "#59A14F", // Forest Green
  "#F28E2B", // Warm Amber
  "#76B7B2", // Muted Teal
  "#B07AA1", // Mauve / Plum
  "#EDC948", // Muted Ochre Gold
  "#9C755F", // Terracotta
  "#D37295", // Dusty Rose
  "#64748B", // Steel Gray
  "#2E86AB", // Deep Cyan
  "#7F9C96", // Sage Green
];

export function getGroupColor(groupName: string, index?: number): string {
  if (typeof index === "number" && index >= 0) {
    return METRO_PALETTE[index % METRO_PALETTE.length];
  }
  let hash = 0;
  for (let i = 0; i < groupName.length; i++) {
    hash = (hash << 5) - hash + groupName.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % METRO_PALETTE.length;
  return METRO_PALETTE[idx];
}

interface MetroStation {
  node: MovieNode;
  x: number;
  y: number;
  isRecommended: boolean;
  primaryGroup: string;
  secondaryGroup?: string;
  interchangeLane?: MetroLane;
}

interface MetroLane {
  id: string;
  name: string;
  color: string;
  y: number;
  startX: number;
  endX: number;
  stations: MetroStation[];
  watchedCount: number;
  totalCount: number;
}

interface MetroMapProps {
  watchedNodes: MovieNode[];
  recommendedNodes: MovieNode[];
  connectionMode: ConnectionMode;
  onSelectNode: (node: MovieNode) => void;
  selectedNodeId?: string | number | null;
  highlightedPerson?: string | null;
  readOnly?: boolean;
  nodeRings?: Record<string | number, "coral" | "blue" | "green">;
}

// Dimensions
const STATION_W = 80;
const STATION_H = 120;
const STATION_GAP = 145;
const LANE_HEIGHT = 220;
const X_LANE_START = 220;
const Y_START = 140;
const Y_TIME_AXIS = 60;

export default function MetroMap({
  watchedNodes,
  recommendedNodes,
  connectionMode,
  onSelectNode,
  selectedNodeId,
  highlightedPerson,
  readOnly = false,
  nodeRings = {},
}: MetroMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Pan and Zoom state
  const [pan, setPan] = useState({ x: 30, y: 30 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Hover states
  const [hoveredLaneId, setHoveredLaneId] = useState<string | null>(null);
  const [hoveredStation, setHoveredStation] = useState<MetroStation | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // Touch tracking for pinch-to-zoom
  const touchDistanceRef = useRef<number | null>(null);

  // Helper to extract primary and secondary grouping keys
  const getGroups = useCallback(
    (node: MovieNode) => {
      if (connectionMode === "director") {
        return {
          primary: node.director?.trim() || "Unknown Director",
          secondary: undefined,
        };
      }
      if (connectionMode === "decade") {
        return {
          primary: node.decade || getDecadeFromYear(node.year) || "Unknown Era",
          secondary: undefined,
        };
      }
      if (connectionMode === "cast") {
        const cast = Array.isArray(node.cast) ? node.cast : [];
        return {
          primary: cast[0]?.trim() || "Lead Cast",
          secondary: cast[1]?.trim(),
        };
      }
      // default: genre
      const g0 = node.genres?.[0]?.name;
      const g1 = node.genres?.[1]?.name;
      return {
        primary: g0 || "General",
        secondary: g1 && g1 !== g0 ? g1 : undefined,
      };
    },
    [connectionMode]
  );

  // Helper to get watched year for time axis alignment
  const getWatchedYear = useCallback((m: MovieNode): number => {
    if (m.watchedOn) {
      const yr = parseInt(m.watchedOn.slice(0, 4), 10);
      if (!isNaN(yr) && yr > 1900) return yr;
    }
    if (m.addedAt) {
      const yr = new Date(m.addedAt).getFullYear();
      if (!isNaN(yr) && yr > 1900) return yr;
    }
    const y = parseInt(m.year, 10);
    if (!isNaN(y) && y > 1900) return y;
    return new Date().getFullYear();
  }, []);

  // Layout calculation
  const { lanes, interchanges, timeAxisYears, totalBounds } = useMemo(() => {
    if (!watchedNodes || watchedNodes.length === 0) {
      return {
        lanes: [] as MetroLane[],
        interchanges: [] as Array<{
          station: MetroStation;
          fromY: number;
          toY: number;
          color: string;
          targetLaneName: string;
        }>,
        timeAxisYears: [] as Array<{ year: number; x: number; width: number }>,
        totalBounds: { minX: 0, maxX: 800, minY: 0, maxY: 600, width: 800, height: 600 },
      };
    }

    // Group all watched movies by primary group
    const laneMap = new Map<string, MovieNode[]>();
    for (const movie of watchedNodes) {
      const { primary } = getGroups(movie);
      if (!laneMap.has(primary)) {
        laneMap.set(primary, []);
      }
      laneMap.get(primary)!.push(movie);
    }

    // Order lanes: number of movies descending (largest first), then alphabetically
    const laneEntries = Array.from(laneMap.entries()).sort((a, b) => {
      const countDiff = b[1].length - a[1].length;
      if (countDiff !== 0) return countDiff;
      return a[0].localeCompare(b[0]);
    });

    // Time Axis: Determine year range across all watched movies
    const allYears = watchedNodes.map(getWatchedYear);
    const minYear = Math.min(...allYears);
    const maxYear = Math.max(...allYears);
    const yearsList: number[] = [];
    const safeMax = Math.max(maxYear, minYear);
    for (let yr = minYear; yr <= safeMax; yr++) {
      yearsList.push(yr);
    }

    // Compute width and startX per year column to prevent station collisions
    const yearColWidths = new Map<number, number>();
    const yearStartX = new Map<number, number>();
    const timeAxisYears: Array<{ year: number; x: number; width: number }> = [];

    let runningTimelineX = X_LANE_START + 20;

    yearsList.forEach((yr) => {
      let maxInLaneForYear = 0;
      laneEntries.forEach(([, mList]) => {
        const countInYear = mList.filter((m) => getWatchedYear(m) === yr).length;
        if (countInYear > maxInLaneForYear) maxInLaneForYear = countInYear;
      });

      const colWidth = Math.max(180, (maxInLaneForYear || 1) * STATION_GAP);
      yearColWidths.set(yr, colWidth);
      yearStartX.set(yr, runningTimelineX);
      timeAxisYears.push({ year: yr, x: runningTimelineX, width: colWidth });
      runningTimelineX += colWidth;
    });

    // Build lanes with stations
    const computedLanes: MetroLane[] = [];
    const laneByName = new Map<string, MetroLane>();
    let maxLaneX = runningTimelineX + 100;

    laneEntries.forEach(([groupName, movies], laneIdx) => {
      const laneY = Y_START + laneIdx * LANE_HEIGHT;
      const laneColor = METRO_PALETTE[laneIdx % METRO_PALETTE.length];

      // Sort watched movies chronologically by watched date ascending
      const sortedWatched = [...movies].sort(
        (a, b) => getNodeWatchedTime(a) - getNodeWatchedTime(b)
      );

      // Find recommendations connected to this lane
      const watchedIdsInLane = new Set(sortedWatched.map((m) => String(m.id)));
      const laneRecs: MovieNode[] = [];

      if (!readOnly) {
        for (const rec of recommendedNodes) {
          const connectsToIdStr = String(rec.connectsToId);
          if (watchedIdsInLane.has(connectsToIdStr)) {
            laneRecs.push(rec);
          } else if (laneIdx === 0 && !watchedNodes.some((w) => String(w.id) === connectsToIdStr)) {
            // Default unassigned recommendations to top lane
            laneRecs.push(rec);
          }
        }
      }

      const stations: MetroStation[] = [];

      // Place watched stations along the shared time axis
      // Track how many movies in this lane have been placed in each year
      const placedInYearCount = new Map<number, number>();

      sortedWatched.forEach((m) => {
        const yr = getWatchedYear(m);
        const colStartX = yearStartX.get(yr) ?? X_LANE_START + 50;
        const currentYearIdx = placedInYearCount.get(yr) || 0;
        placedInYearCount.set(yr, currentYearIdx + 1);

        const x = colStartX + 45 + currentYearIdx * STATION_GAP;
        const groups = getGroups(m);

        stations.push({
          node: m,
          x,
          y: laneY,
          isRecommended: false,
          primaryGroup: groups.primary,
          secondaryGroup: groups.secondary,
        });
      });

      // Place recommended stations after the last watched station in the lane
      const lastWatchedX =
        stations.length > 0
          ? stations[stations.length - 1].x
          : X_LANE_START + 80;

      laneRecs.forEach((r, idx) => {
        const x = lastWatchedX + STATION_GAP * (idx + 1);
        const groups = getGroups(r);
        stations.push({
          node: r,
          x,
          y: laneY,
          isRecommended: true,
          primaryGroup: groups.primary,
          secondaryGroup: groups.secondary,
        });
      });

      const lastStationX =
        stations.length > 0
          ? stations[stations.length - 1].x + STATION_W / 2 + 50
          : X_LANE_START + 140;

      if (lastStationX > maxLaneX) {
        maxLaneX = lastStationX;
      }

      const lane: MetroLane = {
        id: groupName,
        name: groupName,
        color: laneColor,
        y: laneY,
        startX: X_LANE_START,
        endX: lastStationX,
        stations,
        watchedCount: sortedWatched.length,
        totalCount: stations.length,
      };

      computedLanes.push(lane);
      laneByName.set(groupName, lane);
    });

    // Compute interchanges (movies with secondary group matching another active lane)
    const computedInterchanges: Array<{
      station: MetroStation;
      fromY: number;
      toY: number;
      color: string;
      targetLaneName: string;
    }> = [];

    computedLanes.forEach((lane) => {
      lane.stations.forEach((st) => {
        if (!st.isRecommended && st.secondaryGroup) {
          const targetLane = laneByName.get(st.secondaryGroup);
          if (targetLane && targetLane.id !== lane.id) {
            st.interchangeLane = targetLane;
            computedInterchanges.push({
              station: st,
              fromY: lane.y,
              toY: targetLane.y,
              color: targetLane.color,
              targetLaneName: targetLane.name,
            });
          }
        }
      });
    });

    const totalWidth = maxLaneX + 160;
    const totalHeight = Y_START + Math.max(laneEntries.length, 1) * LANE_HEIGHT + 100;

    return {
      lanes: computedLanes,
      interchanges: computedInterchanges,
      timeAxisYears,
      totalBounds: {
        minX: 0,
        maxX: totalWidth,
        minY: 0,
        maxY: totalHeight,
        width: totalWidth,
        height: totalHeight,
      },
    };
  }, [watchedNodes, recommendedNodes, getGroups, getWatchedYear, readOnly]);

  // Zoom-to-fit action
  const handleZoomToFit = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const containerW = el.clientWidth;
    const containerH = el.clientHeight;

    const pad = 50;
    const fitScaleX = (containerW - pad * 2) / totalBounds.width;
    const fitScaleY = (containerH - pad * 2) / totalBounds.height;
    const newZoom = Math.min(Math.max(Math.min(fitScaleX, fitScaleY), 0.35), 1.1);

    const centerX = (containerW - totalBounds.width * newZoom) / 2;
    const centerY = (containerH - totalBounds.height * newZoom) / 2;

    setZoom(newZoom);
    setPan({
      x: Math.max(centerX, 20),
      y: Math.max(centerY, 20),
    });
  }, [totalBounds]);

  // Auto zoom-to-fit on initial load or mode switch
  useEffect(() => {
    const timer = setTimeout(() => {
      handleZoomToFit();
    }, 150);
    return () => clearTimeout(timer);
  }, [watchedNodes.length, connectionMode, handleZoomToFit]);

  // Mouse wheel zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
      setZoom((prevZoom) => {
        const nextZoom = Math.min(Math.max(prevZoom * zoomFactor, 0.25), 2.2);
        setPan((prevPan) => ({
          x: mouseX - (mouseX - prevPan.x) * (nextZoom / prevZoom),
          y: mouseY - (mouseY - prevPan.y) * (nextZoom / prevZoom),
        }));
        return nextZoom;
      });
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, []);

  // Pan dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: dragStartRef.current.panX + dx,
      y: dragStartRef.current.panY + dy,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      dragStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        panX: pan.x,
        panY: pan.y,
      };
      touchDistanceRef.current = null;
    } else if (e.touches.length === 2) {
      setIsDragging(false);
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchDistanceRef.current = dist;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging) {
      const dx = e.touches[0].clientX - dragStartRef.current.x;
      const dy = e.touches[0].clientY - dragStartRef.current.y;
      setPan({
        x: dragStartRef.current.panX + dx,
        y: dragStartRef.current.panY + dy,
      });
    } else if (e.touches.length === 2 && touchDistanceRef.current !== null) {
      const newDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = newDist / touchDistanceRef.current;
      touchDistanceRef.current = newDist;

      setZoom((prev) => Math.min(Math.max(prev * ratio, 0.25), 2.2));
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    touchDistanceRef.current = null;
  };

  // Zoom controls
  const handleZoomIn = () => {
    setZoom((z) => Math.min(z * 1.25, 2.2));
  };
  const handleZoomOut = () => {
    setZoom((z) => Math.max(z * 0.8, 0.25));
  };
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 50, y: 50 });
  };

  // Calculate sticky X position for lane labels while horizontal panning
  const getStickyLabelX = (lane: MetroLane) => {
    const leftVisible = -pan.x / zoom;
    const minX = 24;
    const pinnedX = leftVisible + 28;
    const maxX = lane.endX - 160;
    return Math.min(Math.max(minX, pinnedX), Math.max(maxX, minX));
  };

  // Station hover tooltip handler
  const handleStationHover = (
    station: MetroStation,
    e: React.MouseEvent<HTMLDivElement>
  ) => {
    setHoveredStation(station);
    const rect = e.currentTarget.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (containerRect) {
      setTooltipPos({
        x: rect.left - containerRect.left + rect.width / 2,
        y: rect.top - containerRect.top - 12,
      });
    }
  };

  const handleStationLeave = () => {
    setHoveredStation(null);
    setTooltipPos(null);
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`relative w-full h-full overflow-hidden select-none bg-[#0F0F12] ${
        isDragging ? "cursor-grabbing" : "cursor-grab"
      }`}
    >
      {/* Metro World Container with Pan/Zoom Transform */}
      <div
        style={{
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
          transformOrigin: "0 0",
          width: totalBounds.width,
          height: totalBounds.height,
        }}
        className="relative transition-transform duration-75 ease-out"
      >
        {/* SVG TRANSIT LAYER */}
        <svg
          width={totalBounds.width}
          height={totalBounds.height}
          className="absolute inset-0 pointer-events-none z-0"
        >
          <defs>
            <filter id="metro-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Shared Time Axis: Faint vertical year guidelines across lanes */}
          {timeAxisYears.map(({ year, x }) => (
            <g key={`time-axis-${year}`}>
              <line
                x1={x}
                y1={Y_TIME_AXIS + 15}
                x2={x}
                y2={totalBounds.height - 40}
                stroke="#26262D"
                strokeWidth={1}
                strokeDasharray="4 4"
                opacity={0.8}
              />
              <text
                x={x + 10}
                y={Y_TIME_AXIS + 4}
                fill="#8B8B95"
                fontSize={11}
                fontFamily="monospace"
                fontWeight="600"
                opacity={0.7}
              >
                {year}
              </text>
            </g>
          ))}

          {/* Horizontal Metro Lines per Lane */}
          {lanes.map((lane) => {
            const isDimmed = hoveredLaneId !== null && hoveredLaneId !== lane.id;
            const isHovered = hoveredLaneId === lane.id;

            // Determine where solid line ends and dashed recommendation line begins
            const lastWatched = lane.stations.filter((s) => !s.isRecommended).pop();
            const solidEndX = lastWatched
              ? lastWatched.x + STATION_W / 2 + 10
              : lane.startX + 60;

            const hasRecs = lane.stations.some((s) => s.isRecommended);

            return (
              <g
                key={`lane-lines-${lane.id}`}
                opacity={isDimmed ? 0.2 : 1}
                className="transition-all duration-200"
              >
                {/* Lane Start Terminal Cap Circle */}
                <circle
                  cx={lane.startX}
                  cy={lane.y}
                  r={5.5}
                  fill={lane.color}
                />

                {/* Solid Line (Watched stretch) */}
                <line
                  x1={lane.startX}
                  y1={lane.y}
                  x2={hasRecs ? solidEndX : lane.endX}
                  y2={lane.y}
                  stroke={lane.color}
                  strokeWidth={isHovered ? 5.5 : 4}
                  strokeLinecap="round"
                />

                {/* Dashed Line (Recommendation stretch) */}
                {hasRecs && (
                  <line
                    x1={solidEndX}
                    y1={lane.y}
                    x2={lane.endX}
                    y2={lane.y}
                    stroke={lane.color}
                    strokeWidth={3}
                    strokeDasharray="6 5"
                    strokeLinecap="round"
                  />
                )}

                {/* Terminal Line Cap at end */}
                <line
                  x1={lane.endX}
                  y1={lane.y - 8}
                  x2={lane.endX}
                  y2={lane.y + 8}
                  stroke={lane.color}
                  strokeWidth={3.5}
                  strokeLinecap="round"
                />
              </g>
            );
          })}

          {/* Interchange Vertical Connectors & Transfer Circles */}
          {interchanges.map((ic, idx) => {
            const isDimmed =
              hoveredLaneId !== null &&
              hoveredLaneId !== ic.station.primaryGroup &&
              hoveredLaneId !== ic.targetLaneName;

            return (
              <g
                key={`interchange-${ic.station.node.id}-${idx}`}
                opacity={isDimmed ? 0.2 : 1}
                className="transition-all duration-200"
              >
                {/* Vertical Connector */}
                <line
                  x1={ic.station.x}
                  y1={ic.fromY}
                  x2={ic.station.x}
                  y2={ic.toY}
                  stroke={ic.color}
                  strokeWidth={3.5}
                  strokeLinecap="round"
                  strokeDasharray="4 3"
                />

                {/* Transfer Station White Circle on Destination Line */}
                <circle
                  cx={ic.station.x}
                  cy={ic.toY}
                  r={7}
                  fill="#FFFFFF"
                  stroke={ic.color}
                  strokeWidth={3}
                />
              </g>
            );
          })}
        </svg>

        {/* HTML LANES & STATIONS */}
        {lanes.map((lane) => {
          const isDimmed = hoveredLaneId !== null && hoveredLaneId !== lane.id;
          const stickyX = getStickyLabelX(lane);

          return (
            <div
              key={`lane-group-${lane.id}`}
              className={`transition-opacity duration-200 ${
                isDimmed ? "opacity-25" : "opacity-100"
              }`}
            >
              {/* Sticky Lane Label Header on Left */}
              <div
                style={{
                  position: "absolute",
                  left: stickyX,
                  top: lane.y - 18,
                  zIndex: 25,
                }}
                onMouseEnter={() => setHoveredLaneId(lane.id)}
                onMouseLeave={() => setHoveredLaneId(null)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#17171C]/95 border border-[#26262D] backdrop-blur shadow-md cursor-pointer hover:border-[#FF5A4F]/40 transition-colors"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: lane.color }}
                />
                <span className="text-xs font-bold text-[#F2F2F3] whitespace-nowrap">
                  {lane.name}
                </span>
                <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 rounded bg-[#0F0F12] text-[#8B8B95]">
                  {lane.watchedCount}
                </span>
              </div>

              {/* Stations along this Lane */}
              {lane.stations.map((st) => {
                const isSelected = String(selectedNodeId) === String(st.node.id);
                const isPersonMatch = highlightedPerson
                  ? st.node.director === highlightedPerson ||
                    (st.node.cast || []).includes(highlightedPerson)
                  : false;
                const isStationDimmed = highlightedPerson ? !isPersonMatch : false;

                return (
                  <div
                    key={`station-${st.node.id}`}
                    style={{
                      position: "absolute",
                      left: st.x - STATION_W / 2,
                      top: st.y - STATION_H / 2,
                      width: STATION_W,
                      height: STATION_H,
                    }}
                    className={`group z-10 cursor-pointer transition-opacity duration-200 ${
                      isStationDimmed ? "opacity-25" : "opacity-100"
                    }`}
                    onClick={() => onSelectNode(st.node)}
                    onMouseEnter={(e) => handleStationHover(st, e)}
                    onMouseLeave={handleStationLeave}
                  >
                    {/* Poster Card */}
                    <div
                      className={`relative w-full h-full rounded-xl overflow-hidden bg-[#17171C] border shadow-card transition-all duration-200 group-hover:scale-105 group-hover:shadow-glow ${
                        nodeRings?.[st.node.id] === "coral"
                          ? "border-[#FF5A4F] ring-2 ring-[#FF5A4F] shadow-[0_0_12px_rgba(255,90,79,0.35)]"
                          : nodeRings?.[st.node.id] === "blue"
                          ? "border-[#38BDF8] ring-2 ring-[#38BDF8] shadow-[0_0_12px_rgba(56,189,248,0.35)]"
                          : nodeRings?.[st.node.id] === "green"
                          ? "border-[#34D399] ring-2 ring-[#34D399] shadow-[0_0_12px_rgba(52,211,153,0.35)]"
                          : isPersonMatch
                          ? "border-amber-400 ring-2 ring-amber-400/50 shadow-glow"
                          : isSelected
                          ? "border-[#FF5A4F] ring-2 ring-[#FF5A4F]/30"
                          : st.isRecommended
                          ? "border-dashed border-[#FF5A4F]/70"
                          : "border-[#26262D]"
                      }`}
                    >
                      {st.node.posterPath ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`https://image.tmdb.org/t/p/w185${st.node.posterPath}`}
                          alt={st.node.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-1.5 text-center text-[#8B8B95]">
                          <Film className="w-5 h-5 mb-1 text-[#8B8B95]" />
                          <span className="text-[9px] font-semibold text-[#F2F2F3] line-clamp-2">
                            {st.node.title}
                          </span>
                        </div>
                      )}

                      {/* Small "R" / Recommendation Tag */}
                      {st.isRecommended && (
                        <div
                          className={`absolute top-1.5 right-1.5 z-10 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                            st.node.kind === "stretch"
                              ? "bg-[#FF5A4F] text-[#0F0F12]"
                              : "bg-[#26262D] text-[#F2F2F3] border border-[#383842]"
                          }`}
                        >
                          {st.node.kind === "stretch" ? "Stretch" : "R"}
                        </div>
                      )}

                      {/* User Star Rating Badge on Poster */}
                      {typeof st.node.myRating === "number" && st.node.myRating > 0 && (
                        <div className="absolute bottom-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded-md bg-[#0F0F12]/90 border border-amber-400/40 text-amber-400 font-bold text-[9px] flex items-center gap-0.5 shadow-sm">
                          <Star className="w-2.5 h-2.5 fill-amber-400" />
                          <span>{st.node.myRating.toFixed(1)}</span>
                        </div>
                      )}

                      {/* Interchange Transfer Indicator */}
                      {st.interchangeLane && (
                        <div
                          className="absolute bottom-1.5 right-1.5 z-10 w-5 h-5 rounded-full bg-[#0F0F12]/90 border border-white/80 flex items-center justify-center shadow"
                          title={`Interchange to ${st.interchangeLane.name}`}
                        >
                          <ArrowRightLeft
                            className="w-2.5 h-2.5"
                            style={{ color: st.interchangeLane.color }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Station Title & Date Below Line */}
                    <div className="mt-1.5 text-center w-full">
                      <span className="block text-[11px] font-medium text-[#F2F2F3] line-clamp-2 leading-tight">
                        {st.node.title}
                      </span>
                      <span className="block text-[9px] text-[#8B8B95] font-mono mt-0.5">
                        {st.node.watchedOn
                          ? st.node.watchedOn.length === 4
                            ? st.node.watchedOn
                            : st.node.watchedOn
                          : st.node.year}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Hover Tooltip Overlay */}
        <AnimatePresence>
          {hoveredStation && tooltipPos && (
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              style={{
                position: "absolute",
                left: tooltipPos.x,
                top: tooltipPos.y,
                transform: "translate(-50%, -100%)",
                zIndex: 60,
                pointerEvents: "none",
              }}
              className="w-56 p-2.5 rounded-xl bg-[#17171C]/95 border border-[#26262D] backdrop-blur shadow-2xl text-xs text-[#F2F2F3]"
            >
              <div className="flex items-start justify-between gap-1 mb-1">
                <span className="font-bold text-[#F2F2F3] leading-snug line-clamp-1">
                  {hoveredStation.node.title}
                </span>
                <span className="text-[10px] text-[#8B8B95] font-mono flex-shrink-0">
                  {hoveredStation.node.year}
                </span>
              </div>

              {hoveredStation.node.watchedOn && (
                <div className="text-[10px] text-[#8B8B95] font-mono mb-1">
                  Watched: <span className="text-[#F2F2F3]">{hoveredStation.node.watchedOn}</span>
                </div>
              )}

              {typeof hoveredStation.node.voteAverage === "number" &&
                hoveredStation.node.voteAverage > 0 && (
                  <div className="flex items-center gap-1 text-[11px] text-amber-400 mb-1.5 font-medium">
                    <Star className="w-3 h-3 fill-amber-400" />
                    <span>{hoveredStation.node.voteAverage.toFixed(1)} / 10</span>
                  </div>
                )}

              {/* Connection Reason */}
              <div className="mt-1 pt-1.5 border-t border-[#26262D] text-[11px] leading-relaxed text-[#8B8B95]">
                {hoveredStation.isRecommended ? (
                  <div>
                    <span className="text-[#FF5A4F] font-semibold block mb-0.5">
                      {hoveredStation.node.kind === "stretch"
                        ? "⚡ Stretch Recommendation"
                        : "✨ Similar Recommendation"}
                    </span>
                    <span className="text-[#F2F2F3]">
                      &ldquo;{hoveredStation.node.reason}&rdquo;
                    </span>
                  </div>
                ) : hoveredStation.interchangeLane ? (
                  <span>
                    On the <strong className="text-[#F2F2F3]">{hoveredStation.primaryGroup}</strong>{" "}
                    line, interchange to{" "}
                    <strong className="text-[#F2F2F3]">
                      {hoveredStation.interchangeLane.name}
                    </strong>
                  </span>
                ) : (
                  <span>
                    Station on the{" "}
                    <strong className="text-[#F2F2F3]">{hoveredStation.primaryGroup}</strong> line
                  </span>
                )}
              </div>

              <div className="mt-1 text-[10px] text-[#8B8B95]/80 italic">Click to view details</div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* FLOATING ZOOM & PAN CONTROLS */}
        <div className="absolute bottom-5 right-5 z-40 flex items-center gap-1 p-1 rounded-xl bg-[#17171C]/90 backdrop-blur border border-[#26262D] shadow-card">
          <button
            type="button"
            onClick={handleZoomIn}
            className="p-1.5 rounded-lg text-[#8B8B95] hover:text-[#F2F2F3] hover:bg-[#26262D] transition-colors"
            title="Zoom In (+)"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            className="p-1.5 rounded-lg text-[#8B8B95] hover:text-[#F2F2F3] hover:bg-[#26262D] transition-colors"
            title="Zoom Out (-)"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <div className="w-[1px] h-4 bg-[#26262D] mx-0.5" />
          <button
            type="button"
            onClick={handleZoomToFit}
            className="p-1.5 rounded-lg text-[#8B8B95] hover:text-[#F2F2F3] hover:bg-[#26262D] transition-colors"
            title="Fit to Map"
            aria-label="Zoom to fit"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleResetZoom}
            className="p-1.5 rounded-lg text-[#8B8B95] hover:text-[#F2F2F3] hover:bg-[#26262D] transition-colors"
            title="Reset (100%)"
            aria-label="Reset zoom"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
