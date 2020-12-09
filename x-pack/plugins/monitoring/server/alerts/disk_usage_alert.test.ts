/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { DiskUsageAlert } from './disk_usage_alert';
import { ALERT_DISK_USAGE } from '../../common/constants';
import { fetchDiskUsageNodeStats } from '../lib/alerts/fetch_disk_usage_node_stats';
import { fetchClusters } from '../lib/alerts/fetch_clusters';

type IDiskUsageAlertMock = DiskUsageAlert & {
  defaultParams: {
    threshold: number;
    duration: string;
  };
} & {
  actionVariables: Array<{
    name: string;
    description: string;
  }>;
};

const RealDate = Date;

jest.mock('../lib/alerts/fetch_disk_usage_node_stats', () => ({
  fetchDiskUsageNodeStats: jest.fn(),
}));
jest.mock('../lib/alerts/fetch_clusters', () => ({
  fetchClusters: jest.fn(),
}));

jest.mock('../static_globals', () => ({
  Globals: {
    app: {
      getLogger: () => ({ debug: jest.fn() }),
      config: {
        ui: {
          ccs: { enabled: true },
          metricbeat: { index: 'metricbeat-*' },
          container: { elasticsearch: { enabled: false } },
        },
      },
    },
  },
}));

describe('DiskUsageAlert', () => {
  it('should have defaults', () => {
    const alert = new DiskUsageAlert() as IDiskUsageAlertMock;
    expect(alert.alertOptions.id).toBe(ALERT_DISK_USAGE);
    expect(alert.alertOptions.name).toBe('Disk Usage');
    expect(alert.alertOptions.throttle).toBe('1d');
    expect(alert.alertOptions.defaultParams).toStrictEqual({ threshold: 80, duration: '5m' });
    expect(alert.alertOptions.actionVariables).toStrictEqual([
      { name: 'nodes', description: 'The list of nodes reporting high disk usage.' },
      { name: 'count', description: 'The number of nodes reporting high disk usage.' },
      {
        name: 'internalShortMessage',
        description: 'The short internal message generated by Elastic.',
      },
      {
        name: 'internalFullMessage',
        description: 'The full internal message generated by Elastic.',
      },
      { name: 'state', description: 'The current state of the alert.' },
      { name: 'clusterName', description: 'The cluster to which the nodes belong.' },
      { name: 'action', description: 'The recommended action for this alert.' },
      {
        name: 'actionPlain',
        description: 'The recommended action for this alert, without any markdown.',
      },
    ]);
  });

  describe('execute', () => {
    const FakeDate = function () {};
    FakeDate.prototype.valueOf = () => 1;

    const clusterUuid = 'abc123';
    const clusterName = 'testCluster';
    const nodeId = 'myNodeId';
    const nodeName = 'myNodeName';
    const diskUsage = 91;
    const stat = {
      clusterUuid,
      nodeId,
      nodeName,
      diskUsage,
    };

    const replaceState = jest.fn();
    const scheduleActions = jest.fn();
    const getState = jest.fn();
    const executorOptions = {
      services: {
        callCluster: jest.fn(),
        alertInstanceFactory: jest.fn().mockImplementation(() => {
          return {
            replaceState,
            scheduleActions,
            getState,
          };
        }),
      },
      state: {},
    };

    beforeEach(() => {
      Date = FakeDate as DateConstructor;
      (fetchDiskUsageNodeStats as jest.Mock).mockImplementation(() => {
        return [stat];
      });
      (fetchClusters as jest.Mock).mockImplementation(() => {
        return [{ clusterUuid, clusterName }];
      });
    });

    afterEach(() => {
      Date = RealDate;
      replaceState.mockReset();
      scheduleActions.mockReset();
      getState.mockReset();
    });

    it('should fire actions', async () => {
      const alert = new DiskUsageAlert() as IDiskUsageAlertMock;
      const type = alert.getAlertType();
      await type.executor({
        ...executorOptions,
        params: alert.alertOptions.defaultParams,
      } as any);
      const count = 1;
      expect(scheduleActions).toHaveBeenCalledWith('default', {
        internalFullMessage: `Disk usage alert is firing for ${count} node(s) in cluster: ${clusterName}. [View nodes](elasticsearch/nodes)`,
        internalShortMessage: `Disk usage alert is firing for ${count} node(s) in cluster: ${clusterName}. Verify disk usage levels across affected nodes.`,
        action: `[View nodes](elasticsearch/nodes)`,
        actionPlain: 'Verify disk usage levels across affected nodes.',
        clusterName,
        count,
        nodes: `${nodeName}:${diskUsage}`,
        state: 'firing',
      });
    });

    it('should handle ccs', async () => {
      const ccs = 'testCluster';
      (fetchDiskUsageNodeStats as jest.Mock).mockImplementation(() => {
        return [
          {
            ...stat,
            ccs,
          },
        ];
      });
      const alert = new DiskUsageAlert() as IDiskUsageAlertMock;
      const type = alert.getAlertType();
      await type.executor({
        ...executorOptions,
        params: alert.alertOptions.defaultParams,
      } as any);
      const count = 1;
      expect(scheduleActions).toHaveBeenCalledWith('default', {
        internalFullMessage: `Disk usage alert is firing for ${count} node(s) in cluster: ${clusterName}. [View nodes](elasticsearch/nodes)`,
        internalShortMessage: `Disk usage alert is firing for ${count} node(s) in cluster: ${clusterName}. Verify disk usage levels across affected nodes.`,
        action: `[View nodes](elasticsearch/nodes)`,
        actionPlain: 'Verify disk usage levels across affected nodes.',
        clusterName,
        count,
        nodes: `${nodeName}:${diskUsage}`,
        state: 'firing',
      });
    });
  });
});
