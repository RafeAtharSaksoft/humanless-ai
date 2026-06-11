import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate, useLocation } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { agentsApi, type OrgNode } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { useCompany } from "../context/CompanyContext";
import { useDialogActions } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useSidebar } from "../context/SidebarContext";
import { queryKeys } from "../lib/queryKeys";
import { AgentStatusBadge, AgentStatusCapsule } from "../components/StatusBadge";
import { AgentActionButtons } from "../components/AgentActionButtons";
import { MembershipAction } from "../components/MembershipAction";
import { EntityRow } from "../components/EntityRow";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { relativeTime, cn, agentRouteRef, agentUrl } from "../lib/utils";
import { PageTabBar } from "../components/PageTabBar";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Bot, Plus, List, GitBranch, LayoutGrid, Share2 } from "lucide-react";
import { AGENT_ROLE_LABELS, type Agent } from "@paperclipai/shared";
import {
  resourceMembershipState,
  useResourceMembershipMutation,
  useResourceMemberships,
} from "../hooks/useResourceMemberships";

import { getAdapterLabel } from "../adapters/adapter-display-registry";

const roleLabels = AGENT_ROLE_LABELS as Record<string, string>;

type FilterTab = "all" | "active" | "paused" | "error";

const HIDDEN_AGENT_STATUSES = new Set(["terminated", "pending_approval"]);

function matchesFilter(status: string, tab: FilterTab): boolean {
  if (tab === "all") return true;
  if (tab === "active") return status === "active" || status === "running" || status === "idle";
  if (tab === "paused") return status === "paused";
  if (tab === "error") return status === "error";
  return true;
}

function filterAgents(agents: Agent[], tab: FilterTab): Agent[] {
  return agents
    .filter((a) => !HIDDEN_AGENT_STATUSES.has(a.status) && matchesFilter(a.status, tab))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getConfiguredModel(agent: Agent): string | null {
  const value = agent.adapterConfig?.model;
  if (typeof value !== "string") return null;
  const model = value.trim();
  return model.length > 0 ? model : null;
}

function filterOrgTree(nodes: OrgNode[], tab: FilterTab): OrgNode[] {
  return nodes
    .reduce<OrgNode[]>((acc, node) => {
      const filteredReports = filterOrgTree(node.reports, tab);
      if (HIDDEN_AGENT_STATUSES.has(node.status)) {
        acc.push(...filteredReports);
        return acc;
      }
      if (matchesFilter(node.status, tab) || filteredReports.length > 0) {
        acc.push({ ...node, reports: filteredReports });
      }
      return acc;
    }, [])
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Get a deterministic color from agent name for the avatar */
function getAgentColor(name: string): { bg: string; text: string } {
  const colors = [
    { bg: "bg-primary/15", text: "text-primary" },
    { bg: "bg-cyan-500/15", text: "text-cyan-500" },
    { bg: "bg-emerald-500/15", text: "text-emerald-500" },
    { bg: "bg-amber-500/15", text: "text-amber-500" },
    { bg: "bg-purple-500/15", text: "text-purple-500" },
    { bg: "bg-rose-500/15", text: "text-rose-500" },
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

/** Get initials from agent name */
function getInitials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

/** Get status badge class for the card grid view */
function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "running": return "bg-cyan-500/12 text-cyan-500";
    case "active": case "idle": return "bg-emerald-500/12 text-emerald-500";
    case "error": return "bg-red-500/12 text-red-500";
    case "paused": return "bg-slate-400/12 text-slate-400";
    default: return "bg-muted text-muted-foreground";
  }
}

/** Get status dot class */
function getStatusDotClass(status: string): string {
  switch (status) {
    case "running": return "bg-cyan-500 shadow-[0_0_6px_rgba(6,182,212,0.5)]";
    case "active": case "idle": return "bg-emerald-500";
    case "error": return "bg-red-500";
    case "paused": return "bg-slate-400";
    default: return "bg-muted-foreground";
  }
}

export function Agents() {
  const { selectedCompanyId } = useCompany();
  const { openNewAgent } = useDialogActions();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobile } = useSidebar();
  const pathSegment = location.pathname.split("/").pop() ?? "all";
  const tab: FilterTab = (pathSegment === "all" || pathSegment === "active" || pathSegment === "paused" || pathSegment === "error") ? pathSegment : "all";
  const [view, setView] = useState<"grid" | "list" | "org">("grid");
  const forceListView = isMobile;
  const effectiveView: "grid" | "list" | "org" = forceListView ? "list" : view;

  const { data: agents, isLoading, error } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: orgTree } = useQuery({
    queryKey: queryKeys.org(selectedCompanyId!),
    queryFn: () => agentsApi.org(selectedCompanyId!),
    enabled: !!selectedCompanyId && effectiveView === "org",
  });

  const { data: runs } = useQuery({
    queryKey: [...queryKeys.liveRuns(selectedCompanyId!), "agents-page"],
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 15_000,
  });
  const membershipsQuery = useResourceMemberships(selectedCompanyId);
  const membershipMutation = useResourceMembershipMutation(selectedCompanyId);

  const liveRunByAgent = useMemo(() => {
    const map = new Map<string, { runId: string; liveCount: number }>();
    for (const r of runs ?? []) {
      if (r.status !== "running" && r.status !== "queued") continue;
      const existing = map.get(r.agentId);
      if (existing) {
        existing.liveCount += 1;
        continue;
      }
      map.set(r.agentId, { runId: r.id, liveCount: 1 });
    }
    return map;
  }, [runs]);

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  useEffect(() => {
    setBreadcrumbs([{ label: "Agents" }]);
  }, [setBreadcrumbs]);

  if (!selectedCompanyId) {
    return <EmptyState icon={Bot} message="Select a company to view agents." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  const filtered = filterAgents(agents ?? [], tab);
  const filteredOrg = filterOrgTree(orgTree ?? [], tab);

  // Count agents per filter tab
  const allAgents = agents?.filter(a => !HIDDEN_AGENT_STATUSES.has(a.status)) ?? [];
  const activeCount = allAgents.filter(a => matchesFilter(a.status, "active")).length;
  const pausedCount = allAgents.filter(a => matchesFilter(a.status, "paused")).length;
  const errorCount = allAgents.filter(a => matchesFilter(a.status, "error")).length;

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Agents</h1>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5">
            <Share2 className="h-3.5 w-3.5" />
            Share
          </Button>
          <Button
            size="sm"
            onClick={openNewAgent}
            className="gap-1.5 bg-gradient-to-r from-primary to-primary/90 shadow-[0_2px_8px_rgba(99,102,241,0.3)] hover:shadow-[0_4px_12px_rgba(99,102,241,0.4)] hover:-translate-y-0.5 transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            New Agent
          </Button>
        </div>
      </div>

      {/* Filter tabs + view toggle */}
      <div className="flex items-center justify-between">
        <Tabs value={tab} onValueChange={(v) => navigate(`/agents/${v}`)}>
          <div className="flex items-center gap-1 bg-card rounded-[10px] p-1 border border-border">
            {[
              { value: "all", label: "All", count: allAgents.length },
              { value: "active", label: "Active", count: activeCount },
              { value: "paused", label: "Paused", count: pausedCount },
              { value: "error", label: "Error", count: errorCount },
            ].map((ft) => (
              <button
                key={ft.value}
                className={cn(
                  "px-3 py-1.5 rounded-[8px] text-[13px] font-medium transition-colors flex items-center gap-1.5",
                  tab === ft.value
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => navigate(`/agents/${ft.value}`)}
              >
                {ft.label}
                <span className={cn(
                  "min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-semibold flex items-center justify-center",
                  tab === ft.value ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  {ft.count}
                </span>
              </button>
            ))}
          </div>
        </Tabs>
        {!forceListView && (
          <div className="flex items-center gap-1">
            {([
              { key: "grid", icon: LayoutGrid },
              { key: "list", icon: List },
              { key: "org", icon: GitBranch },
            ] as const).map(({ key, icon: Icon }) => (
              <button
                key={key}
                className={cn(
                  "h-9 w-9 rounded-[8px] flex items-center justify-center transition-colors border",
                  effectiveView === key
                    ? "bg-secondary border-border text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-accent/50"
                )}
                onClick={() => setView(key)}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {agents && agents.length === 0 && (
        <EmptyState
          icon={Bot}
          message="Create your first agent to get started."
          action="New Agent"
          onAction={openNewAgent}
        />
      )}

      {/* Grid View */}
      {effectiveView === "grid" && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((agent) => {
            const color = getAgentColor(agent.name);
            const initials = getInitials(agent.name);
            const model = getConfiguredModel(agent);
            const adapterLabel = getAdapterLabel(agent.adapterType);
            const hasError = agent.status === "error";
            const isLive = liveRunByAgent.has(agent.id);

            return (
              <Link
                key={agent.id}
                to={agentUrl(agent)}
                className={cn(
                  "group block rounded-[14px] border p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg no-underline text-inherit",
                  hasError ? "border-red-500/30 hover:border-red-500/50" : "border-border hover:border-border/80",
                  agent.pausedAt && tab !== "paused" ? "opacity-60" : "",
                  resourceMembershipState(membershipsQuery.data, "agent", agent.id) === "left" ? "opacity-55" : "",
                )}
              >
                {/* Header: Avatar + Status badge */}
                <div className="flex items-start justify-between mb-4">
                  <div className={cn("h-12 w-12 rounded-[14px] flex items-center justify-center text-lg font-bold", color.bg, color.text)}>
                    {initials}
                  </div>
                  <div className={cn("px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5", getStatusBadgeClass(agent.status))}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", getStatusDotClass(agent.status))} />
                    {agent.status === "active" ? "Active" : agent.status.charAt(0).toUpperCase() + agent.status.slice(1)}
                  </div>
                </div>

                {/* Name + Role */}
                <h3 className="text-base font-semibold text-foreground mb-1">{agent.name}</h3>
                <p className="text-[13px] text-muted-foreground mb-4">
                  {roleLabels[agent.role] ?? agent.role}{agent.title ? ` - ${agent.title}` : ""}
                </p>

                {/* Meta stats */}
                <div className="flex gap-4 mb-4">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] text-muted-foreground/70 uppercase tracking-wider">Model</span>
                    <span className="text-[13px] font-semibold text-foreground/80 truncate max-w-[120px]">{model ?? "—"}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] text-muted-foreground/70 uppercase tracking-wider">Adapter</span>
                    <span className="text-[13px] font-semibold text-foreground/80 truncate max-w-[100px]">{adapterLabel}</span>
                  </div>
                  {agent.lastHeartbeatAt && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] text-muted-foreground/70 uppercase tracking-wider">Last HB</span>
                      <span className="text-[13px] font-semibold text-foreground/80">{relativeTime(agent.lastHeartbeatAt)}</span>
                    </div>
                  )}
                </div>

                {/* Tags */}
                <div className="flex gap-1.5 flex-wrap">
                  {adapterLabel && (
                    <span className="px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-primary/10 text-primary">
                      {adapterLabel}
                    </span>
                  )}
                  {isLive && (
                    <span className="px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-cyan-500/10 text-cyan-500 flex items-center gap-1">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-500" />
                      </span>
                      Live
                    </span>
                  )}
                  {roleLabels[agent.role] && (
                    <span className="px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-muted text-muted-foreground">
                      {roleLabels[agent.role]}
                    </span>
                  )}
                </div>

                {/* Error banner */}
                {hasError && (
                  <div className="mt-3 px-3 py-2.5 rounded-lg bg-red-500/8 border border-red-500/15 flex items-center gap-2 text-[12px] text-red-400">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Agent encountered an error
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {effectiveView === "grid" && agents && agents.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No agents match the selected filter.
        </p>
      )}

      {/* List view */}
      {effectiveView === "list" && filtered.length > 0 && (
        <div className="border border-border rounded-xl overflow-hidden">
          {filtered.map((agent) => {
            const hasInvalidOrgChain = agent.orgChainHealth?.status === "invalid_org_chain";
            return (
              <EntityRow
                key={agent.id}
                title={agent.name}
                titleClassName="w-56"
                subtitle={`${roleLabels[agent.role] ?? agent.role}${agent.title ? ` - ${agent.title}` : ""}`}
                to={agentUrl(agent)}
                className={cn(
                  "group",
                  agent.pausedAt && tab !== "paused" ? "opacity-50" : "",
                  resourceMembershipState(membershipsQuery.data, "agent", agent.id) === "left" ? "text-foreground/55" : "",
                )}
                leading={hasInvalidOrgChain ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-label="Invalid reporting chain" />
                ) : (
                  <AgentStatusCapsule status={agent.status} />
                )}
                meta={
                  <div className="hidden xl:flex items-center gap-3">
                    <AgentMetaColumns agent={agent} />
                  </div>
                }
                trailing={
                  <div className="flex items-center gap-3">
                    <span className="sm:hidden">
                      {liveRunByAgent.has(agent.id) ? (
                        <LiveRunIndicator
                          agentRef={agentRouteRef(agent)}
                          runId={liveRunByAgent.get(agent.id)!.runId}
                          liveCount={liveRunByAgent.get(agent.id)!.liveCount}
                        />
                      ) : (
                        <AgentStatusBadge status={agent.status} />
                      )}
                    </span>
                    <div className="hidden sm:flex items-center gap-3">
                      {liveRunByAgent.has(agent.id) && (
                        <LiveRunIndicator
                          agentRef={agentRouteRef(agent)}
                          runId={liveRunByAgent.get(agent.id)!.runId}
                          liveCount={liveRunByAgent.get(agent.id)!.liveCount}
                        />
                      )}
                      <span className="w-20 flex justify-end">
                        <AgentStatusBadge status={agent.status} />
                      </span>
                    </div>
                    <div
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                    >
                      <AgentActionButtons
                        agent={agent}
                        companyId={selectedCompanyId}
                        runLabel="Run Heartbeat"
                        showStatus={false}
                      />
                    </div>
                    <MembershipAction
                      state={resourceMembershipState(membershipsQuery.data, "agent", agent.id)}
                      pending={
                        membershipMutation.isPending &&
                        membershipMutation.variables?.resourceType === "agent" &&
                        membershipMutation.variables.resourceId === agent.id
                      }
                      pendingState={
                        membershipMutation.isPending &&
                        membershipMutation.variables?.resourceType === "agent" &&
                        membershipMutation.variables.resourceId === agent.id
                          ? membershipMutation.variables.state
                          : null
                      }
                      resourceName={agent.name}
                      onJoin={() => membershipMutation.mutate({
                        resourceType: "agent",
                        resourceId: agent.id,
                        resourceName: agent.name,
                        state: "joined",
                      })}
                      onLeave={() => membershipMutation.mutate({
                        resourceType: "agent",
                        resourceId: agent.id,
                        resourceName: agent.name,
                        state: "left",
                      })}
                    />
                  </div>
                }
              />
            );
          })}
        </div>
      )}

      {effectiveView === "list" && agents && agents.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No agents match the selected filter.
        </p>
      )}

      {/* Org chart view */}
      {effectiveView === "org" && filteredOrg.length > 0 && (
        <div className="border border-border rounded-xl py-1 overflow-hidden">
          {filteredOrg.map((node) => (
            <OrgTreeNode
              key={node.id}
              node={node}
              depth={0}
              agentMap={agentMap}
              liveRunByAgent={liveRunByAgent}
              tab={tab}
              memberships={membershipsQuery.data}
              membershipMutation={membershipMutation}
            />
          ))}
        </div>
      )}

      {effectiveView === "org" && orgTree && orgTree.length > 0 && filteredOrg.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No agents match the selected filter.
        </p>
      )}

      {effectiveView === "org" && orgTree && orgTree.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No organizational hierarchy defined.
        </p>
      )}
    </div>
  );
}

function OrgTreeNode({
  node,
  depth,
  agentMap,
  liveRunByAgent,
  tab,
  memberships,
  membershipMutation,
}: {
  node: OrgNode;
  depth: number;
  agentMap: Map<string, Agent>;
  liveRunByAgent: Map<string, { runId: string; liveCount: number }>;
  tab: FilterTab;
  memberships: ReturnType<typeof useResourceMemberships>["data"];
  membershipMutation: ReturnType<typeof useResourceMembershipMutation>;
}) {
  const agent = agentMap.get(node.id);
  const hasInvalidOrgChain = Boolean(agent && agent.orgChainHealth?.status === "invalid_org_chain");
  const membershipState = resourceMembershipState(memberships, "agent", node.id);
  const pending = membershipMutation.isPending &&
    membershipMutation.variables?.resourceType === "agent" &&
    membershipMutation.variables.resourceId === node.id;

  return (
    <div style={{ paddingLeft: depth * 24 }}>
      <Link
        to={agent ? agentUrl(agent) : `/agents/${node.id}`}
        className={cn(
          "group flex items-center gap-3 px-3 py-2 hover:bg-accent/30 transition-colors w-full text-left no-underline text-inherit",
          agent?.pausedAt && tab !== "paused" && "opacity-50",
          membershipState === "left" && "text-foreground/55",
        )}
      >
        {hasInvalidOrgChain ? (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Invalid reporting chain" />
        ) : (
          <AgentStatusCapsule status={node.status} />
        )}
        <div className="flex-1 min-w-[7rem]">
          <span className="text-sm font-medium">{node.name}</span>
          <span className="text-xs text-muted-foreground ml-2">
            {roleLabels[node.role] ?? node.role}
            {agent?.title ? ` - ${agent.title}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="sm:hidden">
            {liveRunByAgent.has(node.id) ? (
              <LiveRunIndicator
                agentRef={agent ? agentRouteRef(agent) : node.id}
                runId={liveRunByAgent.get(node.id)!.runId}
                liveCount={liveRunByAgent.get(node.id)!.liveCount}
              />
            ) : (
              <AgentStatusBadge status={node.status} />
            )}
          </span>
          <div className="hidden sm:flex items-center gap-3">
            {liveRunByAgent.has(node.id) && (
              <LiveRunIndicator
                agentRef={agent ? agentRouteRef(agent) : node.id}
                runId={liveRunByAgent.get(node.id)!.runId}
                liveCount={liveRunByAgent.get(node.id)!.liveCount}
              />
            )}
            {agent && (
              <div className="hidden xl:flex items-center gap-3">
                <AgentMetaColumns agent={agent} />
              </div>
            )}
            <span className="w-20 flex justify-end">
              <AgentStatusBadge status={node.status} />
            </span>
          </div>
          <MembershipAction
            state={membershipState}
            pending={pending}
            pendingState={pending ? membershipMutation.variables?.state : null}
            resourceName={node.name}
            onJoin={() => membershipMutation.mutate({
              resourceType: "agent",
              resourceId: node.id,
              resourceName: node.name,
              state: "joined",
            })}
            onLeave={() => membershipMutation.mutate({
              resourceType: "agent",
              resourceId: node.id,
              resourceName: node.name,
              state: "left",
            })}
          />
        </div>
      </Link>
      {node.reports && node.reports.length > 0 && (
        <div className="border-l border-border/50 ml-4">
          {node.reports.map((child) => (
            <OrgTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              agentMap={agentMap}
              liveRunByAgent={liveRunByAgent}
              tab={tab}
              memberships={memberships}
              membershipMutation={membershipMutation}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentMetaColumns({ agent }: { agent: Agent }) {
  const model = getConfiguredModel(agent);
  const adapterLabel = getAdapterLabel(agent.adapterType);
  return (
    <>
      <div className="w-44 min-w-0 leading-tight">
        <div
          className="truncate font-mono text-xs text-muted-foreground"
          title={model ?? undefined}
        >
          {model ?? "—"}
        </div>
        <div className="truncate font-mono text-[11px] text-muted-foreground/70" title={adapterLabel}>
          {adapterLabel}
        </div>
      </div>
      <span className="w-24 whitespace-nowrap text-right text-xs text-muted-foreground">
        {agent.lastHeartbeatAt ? relativeTime(agent.lastHeartbeatAt) : "—"}
      </span>
    </>
  );
}

function LiveRunIndicator({
  agentRef,
  runId,
  liveCount,
}: {
  agentRef: string;
  runId: string;
  liveCount: number;
}) {
  return (
    <Link
      to={`/agents/${agentRef}/runs/${runId}`}
      className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10 hover:bg-blue-500/20 transition-colors no-underline"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
      </span>
      <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
        Live{liveCount > 1 ? ` (${liveCount})` : ""}
      </span>
    </Link>
  );
}
