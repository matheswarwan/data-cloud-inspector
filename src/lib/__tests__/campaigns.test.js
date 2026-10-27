import { describe, it, expect } from 'vitest'
import { loadCampaigns, memberStatuses, campaignEngagementObjects, campaignEngagementSql } from '../campaigns.js'

describe('campaigns', () => {
  it('lists campaigns and member statuses', async () => {
    const call = async (path) => {
      const q = decodeURIComponent(path.split('q=')[1])
      if (q.includes('FROM CampaignMember')) return { ok: true, data: { records: [{ Status: 'Sent', n: 3 }, { Status: 'Responded', n: 5 }] } }
      return { ok: true, data: { records: [{ attributes: {}, Id: '701000000000001AAA', Name: 'Spring' }] } }
    }
    expect(await loadCampaigns(call, '66.0')).toEqual([{ Id: '701000000000001AAA', Name: 'Spring' }])
    expect(await memberStatuses(call, '66.0', '701000000000001AAA')).toEqual([{ status: 'Responded', count: 5 }, { status: 'Sent', count: 3 }])
    await expect(memberStatuses(call, '66.0', "x' OR")).rejects.toThrow()
  })

  it('finds engagement DMOs with a campaign field and counts per action', () => {
    const catalog = [
      { name: 'ssot__EmailEngagement__dlm', category: 'Engagement', fields: [{ name: 'ssot__CampaignId__c' }, { name: 'ssot__EngagementChannelActionId__c' }] },
      { name: 'ssot__WebsiteEngagement__dlm', category: 'Engagement', fields: [{ name: 'ssot__Url__c' }] },
    ]
    const list = campaignEngagementObjects(catalog)
    expect(list).toEqual([{ object: 'ssot__EmailEngagement__dlm', label: 'ssot__EmailEngagement__dlm', campaignField: 'ssot__CampaignId__c', actionField: 'ssot__EngagementChannelActionId__c' }])
    expect(campaignEngagementSql(list[0], '701000000000001AAA')).toBe("SELECT ssot__EngagementChannelActionId__c AS action, COUNT(*) AS n FROM ssot__EmailEngagement__dlm WHERE ssot__CampaignId__c = '701000000000001AAA' GROUP BY ssot__EngagementChannelActionId__c")
  })
})
