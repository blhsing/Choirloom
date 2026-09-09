"""Pack the checksum-pinned Haruqa ENUNU release for NNSVS inference.

Adapted from oatsu-gh/ENUNU enulib/enunu2nnsvs.py (MIT).
Only checksum-pinned publisher releases can reach this converter.
Never called for user-imported archives: old scaler files contain Python pickle.
"""
from pathlib import Path
import shutil

def pack(source, target):
    import joblib
    import numpy as np
    import torch
    import yaml
    from sklearn.preprocessing import MinMaxScaler, StandardScaler
    from nnsvs.util import StandardScaler as NnsvsScaler
    from worker import inside
    cfg=yaml.safe_load((source/'enuconfig.yaml').read_text(encoding='utf-8-sig'))
    target.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(inside(source,cfg['question_path']),target/'qst.hed')
    shutil.copyfile(inside(source,cfg['table_path']),target/'kana2phonemes.table')
    for kind in ('timelag','duration','acoustic'):
        model=inside(source,cfg['model_dir'])/kind
        shutil.copyfile(model/'model.yaml',target/(kind+'_model.yaml'))
        checkpoint=torch.load(inside(model,cfg[kind]['checkpoint']),map_location='cpu',weights_only=False)
        torch.save({'state_dict':checkpoint['state_dict']},target/(kind+'_model.pth'))
        for side in ('in','out'):
            scaler=joblib.load(inside(source,cfg['stats_dir'])/f'{side}_{kind}_scaler.joblib')
            if isinstance(scaler,MinMaxScaler): stats=('min','scale')
            elif isinstance(scaler,(StandardScaler,NnsvsScaler)): stats=('mean','var','scale')
            else: raise ValueError('unsupportedLegacyScaler')
            for stat in stats: np.save(target/f'{side}_{kind}_scaler_{stat}.npy',getattr(scaler,stat+'_'),allow_pickle=False)
    config={'sample_rate':cfg['sample_rate'],'frame_period':5,'log_f0_conditioning':cfg['log_f0_conditioning'],'use_world_codec':False,
        'timelag':{'allowed_range':cfg['timelag']['allowed_range'],'allowed_range_rest':cfg['timelag']['allowed_range_rest'],'force_clip_input_features':True},
        'duration':{'force_clip_input_features':True},'acoustic':{'subphone_features':'coarse_coding','force_clip_input_features':True,'relative_f0':cfg['acoustic']['relative_f0']}}
    (target/'config.yaml').write_text(yaml.safe_dump(config),encoding='utf-8')
