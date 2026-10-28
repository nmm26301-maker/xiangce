"""Optional host ncnn inference using the exact bundled weights; not an Android device test."""
from pathlib import Path
import ncnn
import numpy as np

model = Path(__file__).resolve().parent.parent / 'app/src/main/assets/ai-engine'
with ncnn.Net() as net:
    net.opt.use_vulkan_compute = False
    net.opt.num_threads = 2
    assert net.load_param(str(model / 'x4.param')) == 0
    assert net.load_model(str(model / 'x4.bin')) == 0
    source = np.random.default_rng(2026).random((3, 24, 32), dtype=np.float32)
    with net.create_extractor() as ex:
        assert ex.input('data', ncnn.Mat(source).clone()) == 0
        code, result = ex.extract('output')
        output = np.array(result)
        assert code == 0 and output.shape == (3, 96, 128), output.shape
        assert np.isfinite(output).all() and float(output.std()) > 0.01
        print('Bundled neural weights: actual CPU inference passed (32×24 → 128×96). Host test, not phone test.')
