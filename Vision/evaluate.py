# 正解ラベル付きのスクショで精度を測る。TRUTH のファイル名は手元のスクショに合わせて書き換える
import cv2, itertools
from slots import find_slots, parts
from typeicons import feature, classify, gender, is_empty
import sys, os
A = (sys.argv[1] if len(sys.argv) > 1 else 'screenshots') + os.sep
TRUTH = {
 '829952d0-image.jpg': [('ほのお','ひこう','male'),('みず','ゴースト','male'),('みず','あく','male'),('むし','みず','male'),('ドラゴン','じめん','male'),('こおり','フェアリー','female')],
 '82bba056-image.jpg': [('みず','フェアリー','male'),('いわ','どく','male'),('ひこう','はがね','male'),('ドラゴン','じめん','male'),('エスパー','フェアリー','female'),(None,'ノーマル','female')],
 '7cd2777a-image.jpg': [(None,'じめん','male'),('はがね','ゴースト',None),('ドラゴン','じめん','female'),(None,'フェアリー','female'),('ドラゴン','こおり','female'),('みず','ひこう','male')],
 '0a2e99b2-image.jpg': [('いわ','あく','female'),('でんき','みず',None),('はがね','ゴースト',None),('ゴースト','フェアリー','female'),(None,'ほのお','male'),('ドラゴン','じめん','male')],
}
data={}
for f in TRUTH:
    im=cv2.imread(A+f); data[f]=[parts(im,s) for s in find_slots(im)]
ok=ng=unseen=0; gok=gng=0; margins=[]
for test in TRUTH:
    templates={}
    for f in TRUTH:
        if f==test: continue
        for p,(t1,t2,_) in zip(data[f],TRUTH[f]):
            for k,t in (('type1',t1),('type2',t2)):
                if t: templates.setdefault(t,[]).append(feature(p[k]))
    for i,(p,(t1,t2,g)) in enumerate(zip(data[test],TRUTH[test])):
        for k,t in (('type1',t1),('type2',t2)):
            got,d,margin=classify(p[k],templates)
            if t and t not in templates: unseen+=1; continue
            if got==t: ok+=1; margins.append(margin) 
            else: ng+=1; print('NG',test,i,k,'正解',t,'判定',got,round(d,2))
        gg=gender(p['gender'])
        if gg==g: gok+=1
        else: gng+=1; print('性別NG',test,i,'正解',g,'判定',gg)
print(f'タイプ:正解{ok} 不正解{ng}(見本のないタイプ{unseen}件は除外) / 性別:正解{gok} 不正解{gng}')
print('最小の余裕', round(min(margins),2) if margins else None)
