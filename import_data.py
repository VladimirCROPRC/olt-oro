"""Build the OLT ORO static data from the two supplied source files."""
import argparse, json, re, math
from collections import Counter, defaultdict
from pathlib import Path
from zipfile import ZipFile
from urllib.parse import urlparse, parse_qs
from lxml import etree, html

def rows(path):
    with ZipFile(path) as archive:
        strings=[]
        for _, item in etree.iterparse(archive.open('xl/sharedStrings.xml'),events=['end'],tag='{*}si'):
            strings.append(''.join(t.text or '' for t in item.findall('.//{*}t')))
            item.clear()
            while item.getprevious() is not None: del item.getparent()[0]
        for _, row in etree.iterparse(archive.open('xl/worksheets/sheet1.xml'),events=['end'],tag='{*}row'):
            values={}
            for cell in row:
                value=cell.findtext('{*}v')
                if cell.get('t')=='s' and value is not None: value=strings[int(value)]
                if cell.get('t')=='inlineStr': value=''.join(t.text or '' for t in cell.findall('.//{*}t'))
                values[re.sub(r'\d+','',cell.get('r'))]=value
            yield int(row.get('r')), values
            row.clear()
            while row.getprevious() is not None: del row.getparent()[0]

def natural(value):
    return [(0,int(x)) if x.isdigit() else (1,x.upper()) for x in re.split(r'(\d+)',value)]

def site_code(name):
    # Match naming positions, not hardware models such as MA5800.
    match=re.match(r'^([A-Z]{2}\d{3,6})(?=[_-]?OLT)',name,re.I)
    if not match:match=re.fullmatch(r'OLT[_-]?\d+[_-]([A-Z]{2}\d{3,6})',name,re.I)
    return match[1].upper() if match else ''

def build(workbook, directory, output):
    sites={}
    doc=html.parse(str(directory),html.HTMLParser(encoding='windows-1252'))
    for link in doc.xpath('//tr/td/a'):
        text=' '.join(link.text_content().replace('\xa0',' ').split())
        match=re.match(r'^([A-Z]{2}\d{3,6})\b\s*(.*)',text,re.I)
        if match:
            code=match[1].upper()
            site=sites.setdefault(code,{'code':code,'name':match[2],'olts':{}})
            try:
                lat,lng=map(float,parse_qs(urlparse(link.get('href','')).query)['q'][0].split(','))
                if math.isfinite(lat) and math.isfinite(lng) and -90<=lat<=90 and -180<=lng<=180:site['location']=[lat,lng]
            except (KeyError,ValueError,TypeError):pass
    equipment={}; stats=Counter(); unmatched=Counter(); malformed=Counter()
    for number,row in rows(workbook):
        if number==1:
            assert row.get('Q')=='OLT', 'Expected OLT in column Q'
            continue
        stats['sourceRows']+=1
        value=(row.get('Q') or '').strip()
        if not value:
            stats['emptyOltRows']+=1
            continue
        stats['nonemptyOltRows']+=1
        # Several rows have both GPON and XGS-PON connections. Keep each one.
        for entry in re.split(r'\s*,\s*',value):
            match=re.fullmatch(r'([^/]+)/([^/]+)/([^/()]+?)\s*(?:\(([^()]*)\))?',entry)
            if not match:
                malformed[entry]+=1
                continue
            name,slot,port,speed=(x.strip() if x else '' for x in match.groups())
            name=name.upper()
            code=site_code(name)
            if not code: unmatched[name]+=1
            if code and code not in sites: sites[code]={'code':code,'name':'','olts':{}}
            key=code or 'OLT:'+name
            if key not in sites: sites[key]={'code':'','name':name,'olts':{}}
            olt=sites[key]['olts'].setdefault(name,{})
            p=olt.setdefault(slot+'/'+port,{'port':slot+'/'+port,'speeds':set(),'references':0,'functions':Counter(),'dps':{}})
            if speed:p['speeds'].add(speed)
            p['references']+=1
            if row.get('F'):p['functions'][row['F']]+=1
            stats['connectionReferences']+=1
            if row.get('F')=='SPL-1':
                stats['level1References']+=1
                try:
                    lat,lng=float(row['K']),float(row['L'])
                    assert math.isfinite(lat) and math.isfinite(lng) and -90<=lat<=90 and -180<=lng<=180 and (lat!=0 or lng!=0)
                except (KeyError,ValueError,TypeError,AssertionError):
                    stats['level1MissingCoordinates']+=1
                else:
                    alias=(row.get('B') or '').strip()
                    point={'alias':alias,'lat':lat,'lng':lng}
                    p['dps'][(alias,lat,lng)]=point
    output.mkdir(parents=True,exist_ok=True);data=output/'data';data.mkdir(exist_ok=True)
    index=[];written=set()
    for i,(key,site) in enumerate(sorted(sites.items(),key=lambda x:natural(x[0]))):
        olts=[]
        for name,ports in sorted(site['olts'].items(),key=lambda x:natural(x[0])):
            records=[]
            for _,port in sorted(ports.items(),key=lambda x:natural(x[0])):
                port['speeds']=sorted(port['speeds']);port['functions']=dict(port['functions']);port['dps']=list(port['dps'].values());records.append(port)
            olts.append({'name':name,'ports':records})
        count=sum(len(o['ports']) for o in olts)
        item={'id':str(i),'code':site['code'],'name':site['name'],'olts':len(olts),'ports':count}
        if site.get('location'):item['location']=site['location']
        if olts:
            item['file']='data/'+str(i)+'.json'
            written.add(item['file'])
            (output/item['file']).write_text(json.dumps({'code':site['code'],'name':site['name'],'location':site.get('location'),'olts':olts},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
        index.append(item)
    for stale in data.glob('*.json'):
        if 'data/'+stale.name not in written:stale.unlink()
    stats['sitesWithOlts']=sum(bool(s['code']) and bool(s['olts']) for s in index)
    stats['sitesInDirectory']=sum(bool(s['code']) for s in index)
    stats['unassignedOlts']=sum(not s['code'] for s in index)
    stats['olts']=sum(s['olts'] for s in index);stats['ports']=sum(s['ports'] for s in index)
    stats['malformedReferences']=sum(malformed.values())
    stats['portsWithLevel1Dp']=sum(bool(p['dps']) for site in sites.values() for olt in site['olts'].values() for p in olt.values())
    (output/'index.json').write_text(json.dumps({'sites':index,'stats':dict(stats)},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    (output.parent/'import-report.json').write_text(json.dumps({'stats':dict(stats),'unassignedOlts':dict(unmatched),'malformed':dict(malformed)},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(dict(stats),ensure_ascii=False),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('workbook',type=Path);parser.add_argument('directory',type=Path)
    parser.add_argument('--output',type=Path,default=Path(__file__).parent/'dist')
    args=parser.parse_args();build(args.workbook,args.directory,args.output)
